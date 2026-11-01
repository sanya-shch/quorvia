import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXPORTS_DIR, resolveExportPath } from "./export.paths.js";

describe("resolveExportPath", () => {
  const dir = path.resolve("/data/exports");

  it("розв'язує звичайне ім'я файлу всередині каталогу", () => {
    expect(resolveExportPath("job-1-form.csv", dir)).toBe(path.join(dir, "job-1-form.csv"));
  });

  it.each(["../secret.txt", "../../etc/passwd", "sub/../../escape.csv", "/etc/passwd"])(
    "відхиляє вихід за межі каталогу: %s",
    (bad) => {
      expect(resolveExportPath(bad, dir)).toBeNull();
    },
  );

  it("відхиляє сам каталог і сусідній каталог із тим самим префіксом", () => {
    expect(resolveExportPath(".", dir)).toBeNull();
    expect(resolveExportPath("../exports-evil/file.csv", dir)).toBeNull();
  });

  it("за замовчуванням працює з EXPORTS_DIR", () => {
    expect(resolveExportPath("a.csv")).toBe(path.join(EXPORTS_DIR, "a.csv"));
  });
});
