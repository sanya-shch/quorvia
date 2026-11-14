import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportToCsv } from "./csv.exporter.js";
import { exportToExcel } from "./excel.exporter.js";
import { exportToPdf } from "./pdf.exporter.js";
import { SCORE_HEADERS, scoreExport } from "./scoreColumns.js";
import { buildExportData } from "./testFixtures.js";
import type { ExportData } from "./exporter.types.js";

const scoring = {
  enabled: true,
  categories: [
    { id: "low", label: "Початківець", min: 0, max: 10 },
    { id: "high", label: "Експерт", min: 11, max: 100 },
  ],
};

// The fixtures' two responses, scored: 15 of 20 (Експерт) and 4 of 20 (Початківець).
const scored = (overrides: Partial<ExportData["form"]> = {}): ExportData => {
  const data = buildExportData({ form: { ...buildExportData().form, scoring, ...overrides } });

  data.responses[0] = { ...data.responses[0]!, score: 15, maxScore: 20, scoreCategoryId: "high" };
  data.responses[1] = { ...data.responses[1]!, score: 4.5, maxScore: 20, scoreCategoryId: "low" };

  return data;
};

const csvRows = async (data: ExportData) =>
  (await exportToCsv(data)).buffer.toString("utf-8").replace("\uFEFF", "").split("\r\n");

describe("scoreExport", () => {
  it("is there for a form that scores", () => {
    expect(scoreExport(scored())).not.toBeNull();
  });

  it("is there when scoring was switched off but responses were scored", () => {
    expect(scoreExport(scored({ scoring: { ...scoring, enabled: false } }))).not.toBeNull();
  });

  it("is not there for a form that never scored", () => {
    expect(scoreExport(buildExportData())).toBeNull();
    expect(
      scoreExport(buildExportData({ form: { ...buildExportData().form, scoring: null } })),
    ).toBeNull();
  });

  it("is there for a form that scores but has no responses yet (the columns are ready)", () => {
    expect(scoreExport({ ...scored(), responses: [] })).not.toBeNull();
  });

  it("names the category, and leaves a deleted one empty", () => {
    const columns = scoreExport(scored())!;
    const [first] = scored().responses;

    expect(columns.cellsFor(first!)).toEqual({ score: 15, maxScore: 20, category: "Експерт" });
    expect(columns.cellsFor({ ...first!, scoreCategoryId: "gone" }).category).toBe("");
    expect(columns.cellsFor({ ...first!, scoreCategoryId: null }).category).toBe("");
    expect(columns.cellsFor({ ...first!, score: null, maxScore: null })).toEqual({
      score: "",
      maxScore: "",
      category: "Експерт",
    });
  });
});

describe("CSV with scores", () => {
  it("adds the three columns after the answers", async () => {
    const [header] = await csvRows(scored());

    expect(header!.split(",").slice(-3)).toEqual([
      SCORE_HEADERS.score,
      SCORE_HEADERS.maxScore,
      SCORE_HEADERS.category,
    ]);
  });

  it("writes the numbers as they are and the category by name", async () => {
    const rows = await csvRows(scored());

    expect(rows[1]!.endsWith(",15,20,Експерт")).toBe(true);
    expect(rows[2]!.endsWith(",4.5,20,Початківець")).toBe(true);
  });

  it("leaves the cells of a response that was not scored empty", async () => {
    const data = scored();

    data.responses[1] = {
      ...data.responses[1]!,
      score: null,
      maxScore: null,
      scoreCategoryId: null,
    };

    expect((await csvRows(data))[2]!.endsWith(",,,")).toBe(true);
  });

  it("keeps a negative total a number, and neutralizes a category label that looks like a formula", async () => {
    const data = scored({
      scoring: {
        enabled: true,
        categories: [{ id: "low", label: '=HYPERLINK("http://x")', min: -50, max: 10 }],
      },
    });

    data.responses[1] = { ...data.responses[1]!, score: -2.5, scoreCategoryId: "low" };

    const row = (await csvRows(data))[2]!;

    expect(row).toContain(",-2.5,20,");
    expect(row).toContain("'=HYPERLINK");
    expect(row).not.toMatch(/,=HYPERLINK/);
  });

  it("adds no columns for a form that never scored", async () => {
    const plain = await csvRows(buildExportData());
    const [header] = plain;

    expect(header).not.toContain(SCORE_HEADERS.score);
  });
});

describe("Excel with scores", () => {
  const readSheet = async (data: ExportData) => {
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load((await exportToExcel(data)).buffer as unknown as ArrayBuffer);

    return workbook.getWorksheet("Відповіді")!;
  };

  it("adds the columns, with the points as numbers a sheet can sum", async () => {
    const sheet = await readSheet(scored());
    const header = (sheet.getRow(1).values as unknown[]).slice(1);

    expect(header.slice(-3)).toEqual([
      SCORE_HEADERS.score,
      SCORE_HEADERS.maxScore,
      SCORE_HEADERS.category,
    ]);

    const first = (sheet.getRow(2).values as unknown[]).slice(1);

    expect(first.slice(-3)).toEqual([15, 20, "Експерт"]);
    expect(typeof first[first.length - 3]).toBe("number");
    const second = (sheet.getRow(3).values as unknown[]).slice(1);

    expect(second[second.length - 3]).toBe(4.5);
  });

  it("has no score columns for a form that never scored", async () => {
    const header = ((await readSheet(buildExportData())).getRow(1).values as unknown[]).slice(1);

    expect(header).not.toContain(SCORE_HEADERS.score);
  });
});

describe("PDF with scores", () => {
  it("still produces a valid document", async () => {
    const file = await exportToPdf(scored());

    expect(file.buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
    expect(file.buffer.length).toBeGreaterThan(500);
  });

  it("is larger than the same export without scores (the score line is there)", async () => {
    const without = await exportToPdf(buildExportData());
    const withScores = await exportToPdf(scored());

    expect(withScores.buffer.length).toBeGreaterThan(without.buffer.length);
  });

  it("copes with responses of which only some were scored", async () => {
    const data = scored();

    data.responses[1] = {
      ...data.responses[1]!,
      score: null,
      maxScore: null,
      scoreCategoryId: null,
    };

    expect((await exportToPdf(data)).buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });
});
