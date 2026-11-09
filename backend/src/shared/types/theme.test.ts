import { describe, expect, it } from "vitest";
import { normalizeTheme, THEME_COLOR_PATTERN } from "@quorvia/shared-types";

describe("THEME_COLOR_PATTERN", () => {
  it.each(["#000000", "#FFFFFF", "#4f46e5", "#aBcDeF"])("accepts %s", (value) => {
    expect(THEME_COLOR_PATTERN.test(value)).toBe(true);
  });

  it.each([
    "red",
    "#fff",
    "#ffff",
    "#12345g",
    "4f46e5",
    "#4f46e5ff",
    "rgb(0,0,0)",
    "var(--x)",
    "#ffffff; background: url(//evil.test/x)",
    "#ffffff\n",
    "#ffffff}",
    "url(javascript:alert(1))",
    "",
  ])("rejects %j", (value) => {
    expect(THEME_COLOR_PATTERN.test(value)).toBe(false);
  });
});

describe("normalizeTheme", () => {
  it("keeps valid values and lowercases colors", () => {
    expect(
      normalizeTheme({
        mode: "dark",
        primaryColor: "#4F46E5",
        backgroundColor: "#0F172A",
        textColor: "#F1F5F9",
        font: "lora",
        radius: "large",
      }),
    ).toEqual({
      mode: "dark",
      primaryColor: "#4f46e5",
      backgroundColor: "#0f172a",
      textColor: "#f1f5f9",
      font: "lora",
      radius: "large",
    });
  });

  it("drops unknown keys and invalid values one by one", () => {
    expect(
      normalizeTheme({
        primaryColor: "red",
        backgroundColor: "#ffffff",
        font: "comic-sans",
        radius: "huge",
        mode: "sepia",
        extra: "<script>",
      }),
    ).toEqual({ backgroundColor: "#ffffff" });
  });

  it("never lets CSS-injection payloads through", () => {
    const theme = normalizeTheme({
      primaryColor: "#ffffff; background:url(//evil.test)",
      backgroundColor: "expression(alert(1))",
      textColor: "#000000}</style><script>alert(1)</script>",
      font: "Arial; src: url(x)",
    });

    expect(theme).toBeNull();
  });

  it.each([null, undefined, 0, "dark", [], [{ mode: "dark" }], {}])(
    "returns null for %j",
    (value) => {
      expect(normalizeTheme(value)).toBeNull();
    },
  );
});
