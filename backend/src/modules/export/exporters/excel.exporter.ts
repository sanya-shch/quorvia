import ExcelJS from "exceljs";
import { otherAnswerKey } from "@quorvia/shared-types";
import { ExportData, Exporter, GeneratedFile } from "./exporter.types.js";
import { AnswerValue, formatAnswer, slugifyFileName } from "./formatAnswer.js";

export const exportToExcel: Exporter = async (data: ExportData): Promise<GeneratedFile> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Quorvia";
  workbook.created = new Date();

  const questions = [...data.questions].sort((a, b) => a.order - b.order);

  const summarySheet = workbook.addWorksheet("Огляд");
  summarySheet.columns = [
    { header: "Поле", key: "field", width: 24 },
    { header: "Значення", key: "value", width: 60 },
  ];
  summarySheet.addRows([
    { field: "Назва форми", value: data.form.title },
    { field: "Опис", value: data.form.description ?? "—" },
    { field: "Кількість запитань", value: questions.length },
    { field: "Кількість відповідей", value: data.responses.length },
    { field: "Дата експорту", value: new Date().toLocaleString("uk-UA") },
  ]);
  summarySheet.getRow(1).font = { bold: true };

  const responsesSheet = workbook.addWorksheet("Відповіді");
  responsesSheet.columns = [
    { header: "Дата надсилання", key: "createdAt", width: 22 },
    ...questions.map((q) => ({
      header: q.text,
      key: q.id,
      width: Math.min(Math.max(q.text.length, 15), 40),
    })),
  ];
  responsesSheet.getRow(1).font = { bold: true };
  responsesSheet.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  responsesSheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const response of data.responses) {
    const answers = response.answers as Record<string, AnswerValue>;

    const row: Record<string, string> = {
      createdAt: response.createdAt.toLocaleString("uk-UA"),
    };

    for (const question of questions) {
      row[question.id] = formatAnswer(
        question,
        answers[question.id],
        answers[otherAnswerKey(question.id)],
      );
    }

    responsesSheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer: Buffer.from(buffer),
    fileName: `${slugifyFileName(data.form.title)}-responses.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
};
