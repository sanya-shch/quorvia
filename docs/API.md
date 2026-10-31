# Quorvia API

Base URL: `http://localhost:5001/api`

All bodies are JSON. Errors have the shape `{ "message": "<ERROR_CODE>", "errors": ... }`; `message` is a stable code from `@quorvia/shared-types` (`ErrorCode`) that the frontends translate.

**Auth** - endpoints marked 🔒 need `Authorization: Bearer <access token>`. Every `:formId` endpoint additionally checks that the form belongs to the authenticated user (otherwise `403 FORM_FORBIDDEN` / `404 FORM_NOT_FOUND`).

## Rate limits

Exceeding a limit returns `429 RATE_LIMITED`. Limits are per IP unless noted (in-memory, see README → Security).

| Scope | Limit |
| --- | --- |
| All `/api` | 600 / 15 min |
| `POST /auth/register`, `POST /auth/login` | stricter dedicated limiter |
| `POST /auth/refresh` | 60 / 15 min |
| `POST /forms/:shareId/responses` | 20 / 10 min per IP **and form** |
| `PUT /forms/:shareId/attempt` | 120 / min per IP **and form** |
| `POST /forms/:formId/export` | 10 / hour per user, max 3 active exports |

## Auth

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/register` | Create an account. Body: `{ email, password }` (password 8-72 bytes, upper+lower case letter and digit). Email is trimmed and lowercased. |
| POST | `/auth/login` | Body: `{ email, password }`. Returns `{ user, accessToken }` and sets the httpOnly `refreshToken` cookie (path `/api/auth`). |
| POST | `/auth/refresh` | Rotates the refresh cookie and returns a new `accessToken`. Replaying an already-used token revokes all of the user's sessions. |
| POST | `/auth/logout` | Revokes the refresh token and clears the cookie. |
| GET 🔒 | `/auth/me` | Current user. |

## Forms (owner)

| Method | Path | Description |
| --- | --- | --- |
| GET 🔒 | `/forms` | List own forms. |
| POST 🔒 | `/forms` | Create a form. Body: `{ title (3-200), description? }`. |
| GET 🔒 | `/forms/:formId/admin` | Full form with questions. |
| PATCH 🔒 | `/forms/:formId` | Replace title, description, mode and the whole question list (limits: 200 questions, 100 options per question, 500 chars per text). Text `pattern` must be RE2-compatible. Conditions are validated as a graph (no cycles, only references to earlier questions). **Optimistic locking:** send the `version` you loaded (returned by `GET /forms/:formId/admin`); if the form was saved by someone else since, the answer is `409 FORM_VERSION_CONFLICT` and nothing is written. Success returns `{ success: true, version }` with the new version. Without `version` the request is still applied atomically against the version read at its start. |
| PATCH 🔒 | `/forms/:formId/publish` | Publish. |
| PATCH 🔒 | `/forms/:formId/unpublish` | Unpublish. |
| POST 🔒 | `/forms/:formId/duplicate` | Copy (unpublished, `(Copy)` suffix). |
| DELETE 🔒 | `/forms/:formId` | Delete the form with its data. |

## Public form (anonymous)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/forms/public/:shareId` | Published form for respondents (`404 FORM_NOT_AVAILABLE` otherwise). |
| PUT | `/forms/:shareId/attempt` | Autosave progress. Body: `{ sessionKey, answers, reachedQuestionIds? }` (`reachedQuestionIds` - ids of questions actually shown; merged server-side, never shrinks). |
| POST | `/forms/:shareId/responses` | Submit. Body: `{ answers, sessionKey? }`. The server recomputes visible questions, validates answers and drops answers to hidden questions. |

`answers` limits: at most 500 keys; strings up to 10,000 chars; arrays up to 200 items.

## Analytics (owner) 🔒

| Method | Path | Description |
| --- | --- | --- |
| GET | `/forms/:formId/analytics` | Overview. |
| GET | `/forms/:formId/analytics/funnel` | Funnel of reached/answered questions. |
| GET | `/forms/:formId/analytics/paths` | Branch/path statistics. |
| GET | `/forms/:formId/questions/:questionId/analytics` | Per-question statistics. |
| GET | `/forms/:formId/responses?page=&limit=` | Paginated responses (`limit` max 100, default 10). |
| GET | `/forms/:formId/responses/:responseId` | One response. |

## Export (owner) 🔒

| Method | Path | Description |
| --- | --- | --- |
| POST | `/forms/:formId/export` | Queue an export. Body: `{ format: "CSV" \| "EXCEL" \| "PDF" }`. Returns the job (`PENDING`). |
| GET | `/forms/:formId/export` | List export jobs. |
| GET | `/forms/:formId/export/:jobId` | Job status (`PENDING` / `PROCESSING` / `COMPLETED` / `FAILED`). A failed job has `error` = `EXPORT_FAILED` or `EXPORT_TOO_LARGE` (more than 20,000 responses). |
| GET | `/forms/:formId/export/:jobId/download` | Download the finished file. |
