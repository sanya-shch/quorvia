import { describe, expect, it } from "vitest";
import {
  getOtherOption,
  isOtherAnswerKey,
  isOtherSelected,
  otherAnswerKey,
} from "@quorvia/shared-types";

const options = [
  { id: "a", text: "A" },
  { id: "b", text: "B" },
  { id: "other", text: "Інше", isOther: true },
];

describe("«Інше»: спільні хелпери", () => {
  it("ключ тексту будується з id питання і розпізнається", () => {
    expect(otherAnswerKey("q1")).toBe("q1__other");
    expect(isOtherAnswerKey("q1__other")).toBe(true);
    expect(isOtherAnswerKey("q1")).toBe(false);
  });

  it("getOtherOption знаходить варіант або повертає undefined", () => {
    expect(getOtherOption(options)?.id).toBe("other");
    expect(getOtherOption(options.slice(0, 2))).toBeUndefined();
    expect(getOtherOption(null)).toBeUndefined();
  });

  it("CHOICE_SINGLE: обрано лише коли відповідь - id «Інше»", () => {
    expect(isOtherSelected("CHOICE_SINGLE", options, "other")).toBe(true);
    expect(isOtherSelected("CHOICE_SINGLE", options, "a")).toBe(false);
    expect(isOtherSelected("CHOICE_SINGLE", options, "")).toBe(false);
  });

  it("CHOICE_MULTI: обрано, якщо id «Інше» є в масиві", () => {
    expect(isOtherSelected("CHOICE_MULTI", options, ["a", "other"])).toBe(true);
    expect(isOtherSelected("CHOICE_MULTI", options, ["a"])).toBe(false);
    expect(isOtherSelected("CHOICE_MULTI", options, "other")).toBe(false);
  });

  it("без варіанта «Інше» або для інших типів - завжди false", () => {
    expect(isOtherSelected("CHOICE_SINGLE", options.slice(0, 2), "a")).toBe(false);
    expect(isOtherSelected("TEXT", options, "other")).toBe(false);
  });
});
