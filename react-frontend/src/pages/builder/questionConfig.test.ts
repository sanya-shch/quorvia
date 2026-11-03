import { describe, expect, it } from "vitest";
import { QUESTION_TYPES } from "@quorvia/shared-types";
import {
  createDefaultOptions,
  createDefaultQuestionConfig,
  questionTypeSupportsConditions,
  questionTypeUsesConfig,
  questionTypeUsesOptions,
} from "./questionConfig";

describe("createDefaultQuestionConfig", () => {
  it("зберігає типові конфіги наявних типів", () => {
    expect(createDefaultQuestionConfig("TEXT")).toEqual({ variant: "input" });
    expect(createDefaultQuestionConfig("BOOLEAN")).toEqual({ defaultValue: false });
    expect(createDefaultQuestionConfig("CHOICE_SINGLE")).toEqual({ displayVariant: "list" });
    expect(createDefaultQuestionConfig("CHOICE_MULTI")).toEqual({ displayVariant: "list" });
    expect(createDefaultQuestionConfig("NUMBER")).toBeNull();
    expect(createDefaultQuestionConfig("DATE")).toBeNull();
  });

  it("шкали отримують валідні типові межі", () => {
    expect(createDefaultQuestionConfig("RATING")).toEqual({ max: 5 });
    expect(createDefaultQuestionConfig("SCALE")).toEqual({ min: 1, max: 5 });
    expect(createDefaultQuestionConfig("NPS")).toBeNull();
  });

  it("тип без config не відправляє config на сервер", () => {
    expect(questionTypeUsesConfig("NPS")).toBe(false);
    expect(questionTypeUsesConfig("DATE")).toBe(false);
    expect(questionTypeUsesConfig("RATING")).toBe(true);
    expect(questionTypeUsesConfig("SCALE")).toBe(true);
  });

  it("для кожного типу, який зберігає config, є типовий config (крім NUMBER)", () => {
    for (const type of QUESTION_TYPES) {
      if (type === "NUMBER" || !questionTypeUsesConfig(type)) continue;

      expect(createDefaultQuestionConfig(type), type).not.toBeNull();
    }
  });
});

describe("варіанти та умови для типів питань", () => {
  const label = (n: number) => `Варіант ${n}`;

  it("тип із варіантами отримує стартовий набір: вибір - 1, ранжування - 2 (мінімум)", () => {
    expect(createDefaultOptions("CHOICE_SINGLE", label).map((o) => o.text)).toEqual(["Варіант 1"]);
    expect(createDefaultOptions("CHOICE_MULTI", label)).toHaveLength(1);
    expect(createDefaultOptions("RANKING", label).map((o) => o.text)).toEqual([
      "Варіант 1",
      "Варіант 2",
    ]);
  });

  it("id стартових варіантів унікальні (ранжування вимагає унікальності)", () => {
    const ids = createDefaultOptions("RANKING", label).map((o) => o.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("типи без варіантів не отримують options", () => {
    for (const type of ["TEXT", "NUMBER", "BOOLEAN", "DATE", "RATING", "SCALE", "NPS"] as const) {
      expect(questionTypeUsesOptions(type), type).toBe(false);
      expect(createDefaultOptions(type, label), type).toEqual([]);
    }
  });

  it("ранжування не зберігає config і не використовується в умовах", () => {
    expect(createDefaultQuestionConfig("RANKING")).toBeNull();
    expect(questionTypeUsesConfig("RANKING")).toBe(false);
    expect(questionTypeUsesOptions("RANKING")).toBe(true);
    expect(questionTypeSupportsConditions("RANKING")).toBe(false);
    expect(questionTypeSupportsConditions("CHOICE_SINGLE")).toBe(true);
    expect(questionTypeSupportsConditions("NPS")).toBe(true);
  });
});
