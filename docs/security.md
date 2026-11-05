# Security

This is a portfolio project, but it is built to be hardened the way a real survey platform would be. Public forms accept anonymous input, so the backend treats every request as untrusted.

## What is implemented

| Area | Measure |
| --- | --- |
| Authentication | bcrypt (cost 12); passwords limited to 72 bytes (bcrypt's real limit); emails normalized (trim + lowercase); constant-time-ish login (dummy hash when the user does not exist) |
| Sessions | Short-lived access JWT (15 min, `HS256` pinned for sign *and* verify); opaque refresh token in an httpOnly, path-restricted cookie; only its SHA-256 hash is stored |
| Refresh rotation | Atomic rotation (`updateMany ... WHERE revokedAt IS NULL`), so two parallel requests cannot both succeed; **reuse detection** revokes all of the user's tokens when an already-revoked token is replayed; hourly cleanup of expired/revoked tokens in the worker |
| Browser storage | The access token is kept **in memory only**; after a page reload the session is restored silently from the refresh cookie |
| Authorization | Every form/response/analytics/export endpoint checks ownership of the parent resource; child resources are verified to belong to the parent |
| Concurrent edits | `Form.version` is an optimistic lock: saving is a conditional `UPDATE ... WHERE version = N` that is the first action of the transaction, so a stale editor gets `409 FORM_VERSION_CONFLICT` instead of silently overwriting another tab's changes; the builder then offers to load the latest version. Publishing does not bump the version (it does not touch builder-edited content) |
| Input validation | Zod on every body; length/size limits on forms, questions, options and conditions; caps on `answers` (keys, string length, array size); bounded pagination (`limit <= 100`) |
| ReDoS | User-defined regex patterns are compiled with **RE2** (linear time) both at save time and at validation time; patterns RE2 cannot run (lookahead, backreferences) are rejected |
| Rate limiting | Per-IP: whole API, login/register, refresh; per-IP **and per form** for public submissions and autosave; per-user for export creation, plus a cap on concurrent exports |
| Exports | CSV formula injection neutralized (`=`, `+`, `-`, `@`, tab, CR); responses capped per export; workers store a stable error code, never raw error text |
| HTTP | `helmet`, explicit CORS allow-list (comma-separated `CORS_ORIGIN`), `trust proxy` configurable via `TRUST_PROXY`, malformed/oversized JSON answered with 400/413 |
| Config | In production the API refuses to start with a short or example `JWT_SECRET` or a `localhost` `CORS_ORIGIN` |
| Frontend | No `dangerouslySetInnerHTML` / `v-html`; production build ships a Content-Security-Policy `<meta>` that allows scripts only from the app and the Vue remote origin |
| Supply chain | Dependabot, CodeQL, `pnpm audit` job, least-privilege `GITHUB_TOKEN` in CI |
| Local infra | Postgres and Redis ports are published on `127.0.0.1` only |

## Data retention

The worker runs maintenance tasks on start and then periodically (all of them idempotent, so several worker instances only duplicate work):

| Task | Interval | What it removes |
| --- | --- | --- |
| `token-cleanup` | hourly | Expired or revoked refresh tokens (after a 7-day grace) |
| `export-cleanup` | daily | Export jobs older than `EXPORT_RETENTION_DAYS` together with their files, plus files in `uploads/exports` that have no database row (for example after a form was deleted - the cascade removes the rows, not the files) |
| `attempt-cleanup` | daily | **Unfinished** `ResponseAttempt` rows that started more than `ATTEMPT_RETENTION_DAYS` ago |

Design notes:

- Work is done in batches of 500, so neither the id lists nor the deletes grow with the table.
- Files are removed before their rows. A crash in between leaves a row without a file (downloads answer `410`, the next run removes the row) rather than a file nobody tracks. Stored file names are resolved inside the exports directory and anything that would escape it is ignored.
- Orphan files are only deleted when older than the retention period, so a file the worker has just written but not yet recorded is never touched. Files whose names do not look like `<job uuid>-<name>` are left alone.
- **Completed attempts are never deleted**: the funnel needs them. Deleting abandoned attempts does have a visible side effect - they stop counting towards `totalAttempts`, so the completion rate for the old period goes up. Set `ATTEMPT_RETENTION_DAYS=0` if you prefer exact historical numbers over table size. The cut-off uses `startedAt` (immutable, indexed) rather than `updatedAt`, which every autosave changes.

## Known gaps / deployment notes

- **Rate-limit state is in memory.** With more than one backend instance each one counts separately; use `rate-limit-redis` (Redis is already part of the stack).
- **Set `TRUST_PROXY`** (for example `1`) when running behind nginx, Render, Railway or similar. Without it every user shares the proxy's IP and therefore one rate limit.
- **Same-site deployment.** The refresh cookie is `SameSite=Lax`. Serve the frontend and the API from the same site (e.g. `app.example.com` and `api.example.com`); on unrelated domains the browser will not send the cookie and sessions will end after 15 minutes.
- **HTTP security headers for the frontend.** The CSP in the build is a `<meta>` tag, which cannot express `frame-ancestors`. Prefer sending a CSP header (plus `X-Content-Type-Options`, `Referrer-Policy`) from the static host. Set `VITE_DISABLE_CSP=true` to turn the meta tag off.
- **Exports live on local disk.** The worker writes files to `uploads/exports` and the API serves them from the same path, so both processes must see the same filesystem (a shared volume when they run in separate containers). Object storage would remove this constraint.
- **The Vue remote is trusted code.** It runs inside the React page with access to the in-memory token. Host it under your control and keep `VITE_VUE_ANALYTICS_URL` pointing only to it.
- **Redis has no password** in the local Docker setup (it is bound to loopback). Use authentication and TLS for any shared environment.
- Not implemented: email verification, password reset, account lockout, CAPTCHA/bot protection on public forms, audit log, GitHub Actions pinned to commit SHAs.
