import { describe, expect, it } from "vitest";
import en from "./locales/en";
import uk from "./locales/uk";

// Only the active language is loaded at runtime, so there is no English
// fallback for a missing key: both bundles must stay in sync.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const collectKeys = (value: unknown, prefix = ""): string[] =>
  value && typeof value === "object"
    ? Object.entries(value).flatMap(([key, child]) => collectKeys(child, prefix ? `${prefix}.${key}` : key))
    : [prefix.replace(PLURAL_SUFFIX, "")];

describe("locale bundles", () => {
  it("have the same keys in uk and en (plural forms aside)", () => {
    const enKeys = new Set(collectKeys(en));
    const ukKeys = new Set(collectKeys(uk));

    expect([...enKeys].filter((key) => !ukKeys.has(key))).toEqual([]);
    expect([...ukKeys].filter((key) => !enKeys.has(key))).toEqual([]);
  });
});
