import { describe, expect, it } from "vitest";
import {
  SCREEN_LIMITS,
  isHttpUrl,
  localizeForm,
  normalizeEndScreen,
  normalizeFormTranslations,
  normalizeWelcomeScreen,
} from "@quorvia/shared-types";

describe("isHttpUrl", () => {
  it.each([
    "http://example.com",
    "https://example.com/thanks?x=1#done",
    "https://sub.example.com:8443/a/b",
    "HTTPS://EXAMPLE.COM",
    "https://xn--80ak6aa92e.com",
  ])("accepts %s", (url) => {
    expect(isHttpUrl(url)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "mailto:a@b.c",
    "//example.com",
    "/relative/path",
    "example.com",
    "https://",
    "https:example.com",
    "https://exa mple.com",
    " https://example.com",
    "https://example.com ",
    "",
  ])("rejects %j", (url) => {
    expect(isHttpUrl(url)).toBe(false);
  });

  it.each([null, undefined, 5, {}, []])("rejects the non-string %j", (value) => {
    expect(isHttpUrl(value)).toBe(false);
  });

  it("rejects an overlong URL", () => {
    expect(isHttpUrl(`https://example.com/${"a".repeat(SCREEN_LIMITS.redirectUrl)}`)).toBe(false);
  });
});

describe("normalizeWelcomeScreen", () => {
  it("keeps a complete screen", () => {
    expect(normalizeWelcomeScreen({ title: "Hi", text: "About", buttonLabel: "Go" })).toEqual({
      title: "Hi",
      text: "About",
      buttonLabel: "Go",
    });
  });

  it("drops empty optional fields and unknown keys", () => {
    expect(
      normalizeWelcomeScreen({ title: "Hi", text: "  ", buttonLabel: "", extra: "x" }),
    ).toEqual({
      title: "Hi",
    });
  });

  it("needs a title", () => {
    expect(normalizeWelcomeScreen({ text: "only text" })).toBeNull();
    expect(normalizeWelcomeScreen({ title: "   " })).toBeNull();
  });

  it("truncates overlong texts", () => {
    const screen = normalizeWelcomeScreen({
      title: "t".repeat(SCREEN_LIMITS.title + 50),
      buttonLabel: "b".repeat(SCREEN_LIMITS.buttonLabel + 50),
    });

    expect(screen?.title).toHaveLength(SCREEN_LIMITS.title);
    expect(screen?.buttonLabel).toHaveLength(SCREEN_LIMITS.buttonLabel);
  });

  it.each([null, undefined, "x", 1, [], [{ title: "a" }]])("returns null for %j", (value) => {
    expect(normalizeWelcomeScreen(value)).toBeNull();
  });
});

describe("normalizeEndScreen", () => {
  it("keeps the text and a valid redirect", () => {
    expect(normalizeEndScreen({ text: "Thanks", redirectUrl: "https://example.com/next" })).toEqual(
      {
        text: "Thanks",
        redirectUrl: "https://example.com/next",
      },
    );
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "/relative", "ftp://x.test", ""])(
    "drops the redirect %j but keeps the screen",
    (redirectUrl) => {
      expect(normalizeEndScreen({ text: "Thanks", redirectUrl })).toEqual({ text: "Thanks" });
    },
  );

  it("needs a text", () => {
    expect(normalizeEndScreen({ redirectUrl: "https://example.com" })).toBeNull();
    expect(normalizeEndScreen({ text: " " })).toBeNull();
  });

  it.each([null, undefined, "x", [], 1])("returns null for %j", (value) => {
    expect(normalizeEndScreen(value)).toBeNull();
  });
});

describe("screen translations", () => {
  it("keeps the screen texts and drops empty ones when normalizing translations", () => {
    expect(
      normalizeFormTranslations(
        {
          en: {
            welcomeTitle: "Hello",
            welcomeText: " ",
            welcomeButton: "Start",
            endText: "Bye",
            junk: "x",
          },
        },
        ["en"],
      ),
    ).toEqual({ en: { welcomeTitle: "Hello", welcomeButton: "Start", endText: "Bye" } });
  });

  it("localizes both screens and falls back field by field", () => {
    const form = {
      title: "Форма",
      welcomeScreen: { title: "Вітаємо", text: "Опис", buttonLabel: "Почати" },
      endScreen: { text: "Дякуємо", redirectUrl: "https://example.com" },
      translations: { en: { welcomeTitle: "Welcome", endText: "Thank you" } },
    };

    const localized = localizeForm(form, "en");

    expect(localized.welcomeScreen).toEqual({
      title: "Welcome",
      text: "Опис",
      buttonLabel: "Почати",
    });
    expect(localized.endScreen).toEqual({ text: "Thank you", redirectUrl: "https://example.com" });
  });

  it("does not invent screens for a form without them", () => {
    const localized = localizeForm({ title: "A", translations: { en: { title: "B" } } }, "en");

    expect(localized).not.toHaveProperty("welcomeScreen");
    expect(localized).not.toHaveProperty("endScreen");
  });
});
