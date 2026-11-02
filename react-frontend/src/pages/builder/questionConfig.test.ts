import { describe, expect, it } from "vitest";
import { QUESTION_TYPES } from "@quorvia/shared-types";
import { createDefaultQuestionConfig, questionTypeUsesConfig } from "./questionConfig";

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
