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

## Question types

`type` is one of the values below; `config` is validated per type (unknown keys are dropped). Answers are sent in `answers[questionId]`.

| Type | Answer | `config` |
| --- | --- | --- |
| `TEXT` | string | `variant` (`input`/`textarea`/`email`/`name`), `minLength`, `maxLength`, `pattern` |
| `NUMBER` | number | `min`, `max`; `numberVariant: "slider"` (requires `min < max`) with optional `step` (> 0, default 1; answers must lie on the `min + k*step` grid) |
| `CHOICE_SINGLE` / `CHOICE_MULTI` | option id / array of option ids | `displayVariant` (`list`/`tabs`/`dropdown`), `options` |
| `BOOLEAN` | boolean | `defaultValue` |
| `DATE` | date string (anything `Date.parse` accepts; the builder sends `YYYY-MM-DD`) | - |
| `RATING` | integer `1..max` | `max`: integer 3-10 (default 5) |
| `SCALE` | integer `min..max` | `min`: 0 or 1 (default 1), `max`: integer 2-10, strictly greater than `min` (default 5), `minLabel`/`maxLabel` (up to 100 chars) |
| `NPS` | integer `0..10` | - (fixed) |
| `MATRIX` | object `{ rowId: columnId }`, one column per row | `rows`: 1-30 `{ id, text }` (unique ids). The **columns** are the question's `options` (2-10, unique ids, no `isOther`) |
| `RANKING` | array of option ids: a full permutation of the question's options, best first | `options`: 2-20, unique ids (`isOther` is dropped) |

### “Other” option

A choice question (`CHOICE_SINGLE` / `CHOICE_MULTI`) may contain one option with `isOther: true`. It must be the **last** option and cannot be `isDefault`. When the respondent picks it, they also send the free text under a sibling key `<questionId>__other` (max 500 chars, required and non-blank while “Other” is selected):

```json
{ "answers": { "q1": "opt-other", "q1__other": "Matcha" } }
```

The answer to the question itself stays the option id, so conditions (`equals`/`in`) work as for any option. The text is stored only while “Other” is selected (stale text is dropped, the rest is trimmed). The suffix `__other` is reserved: question ids cannot end with it. Validation errors for the text are reported on the question id, not on the `__other` key.

Responses, exports (`Other: Matcha`) and the per-question analytics (`otherAnswers`: top texts by frequency) include the text.

`MATRIX` answers are the only object-valued answers: keys are row ids of the question, values are column (option) ids; unknown rows/columns are rejected. A required matrix needs every row answered, an optional one accepts any subset (including none). Not usable in conditions (like `RANKING`). Exports contain `Row: Column; Row: Column` (one cell per question).

`RANKING` answers must contain every option exactly once; partial rankings, duplicates and unknown ids are rejected. The builder does not offer ranking questions as a condition source (an array order does not map to the simple operators); the server does not block such a condition, but its behaviour is not defined. Exports contain `1. First; 2. Second; ...`.

Scale answers (`RATING`, `SCALE`, `NPS`) are plain numbers, so `0` is a real answer, and conditions can use `equals`, `notEquals`, `gt`, `lt` on them. Exports contain the raw number.

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
| GET | `/forms/:formId/questions/:questionId/analytics` | Per-question statistics (the overview endpoint returns the same fields per question). `RATING`/`SCALE`/`NPS`: `stats` (`avg`/`min`/`max` over in-range answers), `distribution` covering every value of the scale (zeros included) and, for `NPS`, `nps: { promoters, passives, detractors, score }` (`score = %promoters - %detractors`, one decimal, `null` without answers). Answers outside the current scale (config changed after collecting) are excluded from the distribution and the average but counted in `totalAnswers`. `RANKING`: `ranking` (per option, in option order: `avgPosition`, `positions[i]` = respondents who put it at place `i + 1`) and `rankedCount`; only full permutations of the current options are counted, so changing the options after collecting does not skew the averages. `MATRIX`: `matrix` = `{ columns: [{ id, text }], rows: [{ rowId, text, answered, counts }] }` where `counts[i]` is how many respondents picked `columns[i]` in that row (cells are independent, so partial answers count; unknown rows/columns are ignored). Choice questions with an “Other” option also return `otherAnswers`. |
| GET | `/forms/:formId/responses?page=&limit=` | Paginated responses (`limit` max 100, default 10). |
| GET | `/forms/:formId/responses/:responseId` | One response. |

## Export (owner) 🔒

| Method | Path | Description |
| --- | --- | --- |
| POST | `/forms/:formId/export` | Queue an export. Body: `{ format: "CSV" \| "EXCEL" \| "PDF" }`. Returns the job (`PENDING`). |
| GET | `/forms/:formId/export` | List export jobs. |
| GET | `/forms/:formId/export/:jobId` | Job status (`PENDING` / `PROCESSING` / `COMPLETED` / `FAILED`). A failed job has `error` = `EXPORT_FAILED` or `EXPORT_TOO_LARGE` (more than 20,000 responses). |
| GET | `/forms/:formId/export/:jobId/download` | Download the finished file. |
