import { describe, expect, it } from "vitest";
import { IMAGE_CHOICE_LIMITS } from "@quorvia/shared-types";
import { updateFormSchema } from "./form.schema.js";

const IMAGE_ID = "11111111-1111-4111-8111-111111111111";

const parse = (options: unknown) =>
  updateFormSchema.safeParse({
    title: "Form",
    questions: [
      { id: "q1", text: "Pick", type: "IMAGE_CHOICE", order: 0, required: false, options },
    ],
  });

const option = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  text: `Option ${id}`,
  isDefault: false,
  ...extra,
});

const many = (count: number) => Array.from({ length: count }, (_, i) => option(`o${i}`));

describe("updateFormSchema: IMAGE_CHOICE", () => {
  it("accepts options with and without a picture", () => {
    expect(
      parse([
        option("a", { imageAssetId: IMAGE_ID }),
        option("b"),
        option("c", { imageAssetId: null }),
      ]).success,
    ).toBe(true);
  });

  it("keeps the picture id on the parsed option", () => {
    const result = parse([option("a", { imageAssetId: IMAGE_ID }), option("b")]);

    expect(result.success && result.data.questions[0]).toMatchObject({
      options: [{ id: "a", imageAssetId: IMAGE_ID }, { id: "b" }],
    });
  });

  it("requires between the minimum and maximum number of options", () => {
    expect(parse(many(IMAGE_CHOICE_LIMITS.minOptions - 1)).success).toBe(false);
    expect(parse(many(IMAGE_CHOICE_LIMITS.minOptions)).success).toBe(true);
    expect(parse(many(IMAGE_CHOICE_LIMITS.maxOptions)).success).toBe(true);
    expect(parse(many(IMAGE_CHOICE_LIMITS.maxOptions + 1)).success).toBe(false);
  });

  it("requires unique option ids", () => {
    expect(parse([option("a"), option("a")]).success).toBe(false);
  });

  it("requires a text label for every option", () => {
    expect(parse([option("a", { text: "" }), option("b")]).success).toBe(false);
  });

  it("rejects a picture id that is not a uuid", () => {
    expect(parse([option("a", { imageAssetId: "../../etc/passwd" }), option("b")]).success).toBe(
      false,
    );
    expect(
      parse([option("a", { imageAssetId: "http://evil.test/x.png" }), option("b")]).success,
    ).toBe(false);
  });

  it('has no "Other" option: the flag is dropped', () => {
    const result = parse([option("a", { isOther: true }), option("b")]);

    expect(
      result.success && (result.data.questions[0] as { options: object[] }).options[0],
    ).not.toHaveProperty("isOther");
  });
});
