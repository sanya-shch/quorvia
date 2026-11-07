import { describe, expect, it } from "vitest";
import { updateFormSchema } from "./form.schema.js";

const parse = (theme: unknown) => updateFormSchema.safeParse({ title: "Form", questions: [], theme });

describe("updateFormSchema: theme", () => {
  it("accepts a complete valid theme", () => {
    const result = parse({
      mode: "dark",
      primaryColor: "#818cf8",
      backgroundColor: "#0f172a",
      textColor: "#f1f5f9",
      font: "inter",
      radius: "small",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a partial theme, null (remove) and an omitted theme", () => {
    expect(parse({ radius: "none" }).success).toBe(true);
    expect(parse(null).success).toBe(true);
    expect(updateFormSchema.safeParse({ title: "Form", questions: [] }).success).toBe(true);
  });

  it.each([
    ["a named color", { primaryColor: "red" }],
    ["a short hex", { backgroundColor: "#fff" }],
    ["a CSS injection", { textColor: "#000000; background:url(//evil.test)" }],
    ["a font outside the list", { font: "Comic Sans MS" }],
    ["an unknown radius", { radius: "round" }],
    ["an unknown mode", { mode: "auto" }],
    ["an unknown key", { primaryColor: "#000000", customCss: "body{display:none}" }],
  ])("rejects %s", (_label, theme) => {
    expect(parse(theme).success).toBe(false);
  });
});
