import { describe, expect, it } from "vitest";
import { updateFormSchema } from "./form.schema.js";

const parse = (extra: Record<string, unknown>) =>
  updateFormSchema.safeParse({ title: "Form", questions: [], ...extra });

describe("updateFormSchema: welcomeScreen", () => {
  it("accepts a full screen, a title-only screen, null and an omitted field", () => {
    expect(
      parse({ welcomeScreen: { title: "Hi", text: "Intro", buttonLabel: "Go" } }).success,
    ).toBe(true);
    expect(parse({ welcomeScreen: { title: "Hi" } }).success).toBe(true);
    expect(parse({ welcomeScreen: null }).success).toBe(true);
    expect(parse({}).success).toBe(true);
  });

  it.each([
    ["an empty title", { title: "  " }],
    ["no title", { text: "Intro" }],
    ["an overlong title", { title: "t".repeat(201) }],
    ["an overlong button label", { title: "Hi", buttonLabel: "b".repeat(41) }],
    ["an overlong text", { title: "Hi", text: "x".repeat(2001) }],
    ["an unknown key", { title: "Hi", html: "<b>x</b>" }],
  ])("rejects %s", (_label, welcomeScreen) => {
    expect(parse({ welcomeScreen }).success).toBe(false);
  });
});

describe("updateFormSchema: endScreen", () => {
  it("accepts a text with and without a redirect, and null", () => {
    expect(parse({ endScreen: { text: "Thanks" } }).success).toBe(true);
    expect(
      parse({ endScreen: { text: "Thanks", redirectUrl: "https://example.com/x" } }).success,
    ).toBe(true);
    expect(parse({ endScreen: { text: "Thanks", redirectUrl: null } }).success).toBe(true);
    expect(parse({ endScreen: null }).success).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:x",
    "file:///etc/passwd",
    "ftp://example.com",
    "//evil.test",
    "/local",
    "evil.test",
    "https://exa mple.test",
    "",
  ])("rejects the redirect %j", (redirectUrl) => {
    expect(parse({ endScreen: { text: "Thanks", redirectUrl } }).success).toBe(false);
  });

  it.each([
    ["an empty text", { text: " " }],
    ["no text", { redirectUrl: "https://example.com" }],
    ["an unknown key", { text: "Thanks", script: "alert(1)" }],
  ])("rejects %s", (_label, endScreen) => {
    expect(parse({ endScreen }).success).toBe(false);
  });
});

describe("updateFormSchema: screen translations", () => {
  it("accepts the screen texts in a translation and rejects overlong ones", () => {
    expect(
      parse({
        languages: ["en"],
        translations: {
          en: { welcomeTitle: "Hi", welcomeText: "x", welcomeButton: "Go", endText: "Bye" },
        },
      }).success,
    ).toBe(true);
    expect(
      parse({ languages: ["en"], translations: { en: { welcomeButton: "b".repeat(41) } } }).success,
    ).toBe(false);
  });
});
