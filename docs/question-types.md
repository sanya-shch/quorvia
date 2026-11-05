# Question Types

| Type | Answer | Notes |
| --- | --- | --- |
| `TEXT` | string | variants: input, textarea, email, name; length limits and an RE2-compatible pattern |
| `NUMBER` | number | `min`/`max`; optional slider variant with a `step` |
| `CHOICE_SINGLE` | option id | list, tabs or dropdown; optional “Other” option |
| `CHOICE_MULTI` | array of option ids | list or tabs; optional “Other” option |
| `BOOLEAN` | boolean | optional default value |
| `DATE` | date string | |
| `RATING` | integer | stars, 3-10 |
| `SCALE` | integer | linear scale starting at 0 or 1, up to 10, with labels for both ends |
| `NPS` | integer 0-10 | fixed scale; analytics show promoters, passives, detractors and the score |
| `RANKING` | array of option ids | a full ordering of the options, best first (2-20 options) |
| `MATRIX` | `{ rowId: columnId }` | rows x columns, one column per row; also covers Likert statements |

The scale types (`RATING`, `SCALE`, `NPS`) answer with plain numbers, so validation and conditions (`equals`, `gt`, `lt`, ...) work the same way as for `NUMBER`. `RANKING` and `MATRIX` are not available in conditions.

Full per-type configuration, limits and answer formats are in the [API reference](API.md#question-types). Per-type analytics are described in [analytics.md](analytics.md#per-question-analytics).

# Adding a New Question Type

The single source of truth is `QUESTION_TYPES` in `packages/shared-types/src/index.ts`. After adding a value there, the compiler points out some of the missing places and guard tests point out others. The rest has to be done by hand, following the checklist below.

## What is checked automatically

| Place | How it is caught |
| --- | --- |
| Prisma enum `QuestionType` does not match the list | `tsc`: `backend/src/shared/types/questions.check.ts` |
| Zod `questionSchema` does not cover the type | `tsc`: the same file |
| `buildResponseSchema` (answer validation) | `tsc`: `assertNever` in `default` |
| Analytics (overview, details, answer), `formatAnswer` (export) | `tsc`: `assertNever` / `Record<QuestionType, ...>` |
| `QuestionField` (rendering), `getDefaultAnswer` | `tsc`: `assertNever` |
| Builder palette, labels, uk/en translations | `vitest`: `questionTypes.coverage.test.ts` |
| Default question config, whether the config is persisted | `tsc`: `switch` without `default` in `pages/builder/questionConfig.ts` |
| Operators in the condition editor | `tsc`: `Record<QuestionType, ...>` in `ConditionEditor.tsx` |
| Whether the type has options / can be used in conditions | `tsc`: `questionTypeUsesOptions`, `questionTypeSupportsConditions` (`questionConfig.ts`) |
| Answer text on the “Review your answers” screen | `tsc`: `switch` without `default` in `viewer/reviewAnswer.ts` |
| The quick “+” add between questions | built from `QUESTION_TYPES`; checked by `questionTypes.coverage.test.tsx` |

## What is done by hand

1. `backend/prisma/schema.prisma` plus a migration. `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction, so the enum value goes into a separate migration.
2. `form.schema.ts`: a branch in `questionSchema` (config, options).
3. The settings editor in the builder (`FormBuilder.tsx`, `components/editors/`), the badge in `QuestionCard.tsx` and the condition value in `ConditionEditor.tsx` (`packages/condition-engine` does not depend on the type).
4. Analytics in React (`QuestionDetailsPage.tsx`) and Vue (`QuestionOverviewCard.vue`, `ResponseDetailView.vue`): these are `if`/`v-if` chains without an exhaustiveness check, so update them deliberately.
5. i18n: `react-frontend/src/i18n/locales/{uk,en}/*.json` and `vue-analytics/src/i18n/locales/{uk,en}.json`.
6. Tests and `docs/API.md`.
