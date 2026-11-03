# Додавання нового типу питання

Єдине джерело правди - `QUESTION_TYPES` у `packages/shared-types/src/index.ts`.
Після додавання значення туди частину пропусків покаже компілятор, частину -
тести-«сторожі». Решту треба зробити вручну за чеклістом нижче.

## Що перевіряється автоматично

| Місце | Як ловиться |
| --- | --- |
| Prisma-enum `QuestionType` не збігається зі списком | `tsc`: `backend/src/shared/types/questions.check.ts` |
| Zod-схема `questionSchema` не покриває тип | `tsc`: той самий файл |
| `buildResponseSchema` (валідація відповіді) | `tsc`: `assertNever` у `default` |
| Аналітика (огляд, деталі, відповідь), `formatAnswer` (експорт) | `tsc`: `assertNever` / `Record<QuestionType, ...>` |
| `QuestionField` (відображення поля), `getDefaultAnswer` | `tsc`: `assertNever` |
| Палітра конструктора, підписи, переклади uk/en | `vitest`: `questionTypes.coverage.test.ts` |
| Типовий config нового питання, чи зберігається config | `tsc`: `switch` без `default` у `pages/builder/questionConfig.ts` |
| Оператори в редакторі умов | `tsc`: `Record<QuestionType, ...>` у `ConditionEditor.tsx` |
| Чи є в типу варіанти, чи годиться для умов | `tsc`: `questionTypeUsesOptions`, `questionTypeSupportsConditions` (`questionConfig.ts`) |
| Швидке додавання «+» між питаннями | береться з `QUESTION_TYPES`; перевіряє `questionTypes.coverage.test.tsx` |

## Що робиться вручну

1. `backend/prisma/schema.prisma` + міграція. `ALTER TYPE ... ADD VALUE` не можна
   використовувати в тій самій транзакції, тож enum додається окремою міграцією.
2. `form.schema.ts`: гілка в `questionSchema` (config, options).
3. Редактор налаштувань у конструкторі (`FormBuilder.tsx`, `components/editors/`),
   бейдж у `QuestionCard.tsx` і значення умови в `ConditionEditor.tsx`
   (`packages/condition-engine` від типу не залежить).
4. Аналітика в React (`QuestionDetailsPage.tsx`) і Vue
   (`QuestionOverviewCard.vue`, `ResponseDetailView.vue`) - це `if`/`v-if` без
   перевірки вичерпності, їх треба оновити свідомо.
5. i18n: `react-frontend/src/i18n/locales/{uk,en}/*.json` і
   `vue-analytics/src/i18n/locales/{uk,en}.json`.
6. Тести та `docs/API.md`.
