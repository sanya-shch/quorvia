import type { AdminForm, Question } from "../../types/formBuilder";

export const choice = (id: string, text: string, order: number): Question => ({
  id,
  type: "CHOICE_SINGLE",
  text,
  required: false,
  order,
  options: [
    { id: `${id}-a`, text: "Так", isDefault: false },
    { id: `${id}-b`, text: "Ні", isDefault: false },
  ],
  config: null,
});

export const text = (id: string, label: string, order: number, dependsOn?: string): Question => ({
  id,
  type: "TEXT",
  text: label,
  required: false,
  order,
  options: [],
  config: null,
  condition: dependsOn
    ? {
        logic: "AND",
        rules: [{ questionId: dependsOn, operator: "equals", value: `${dependsOn}-a` }],
      }
    : null,
});

// A saved form as the admin endpoint returns it: "Перше" (a choice), "Друге" (shown only when the
// first is "Так"), "Третє".
export const adminForm = (overrides: Partial<AdminForm> = {}): AdminForm => ({
  title: "Опитування",
  description: "Опис опитування",
  responseMode: "ALL_AT_ONCE",
  version: 3,
  questions: [choice("q1", "Перше", 0), text("q2", "Друге", 1, "q1"), text("q3", "Третє", 2)],
  defaultLanguage: "uk",
  languages: [],
  translations: null,
  responseCount: 0,
  isPublished: false,
  shareId: "share-1",
  createdAt: "2026-10-02T09:00:00.000Z",
  updatedAt: "2026-11-17T10:42:00.000Z",
  ...overrides,
});
