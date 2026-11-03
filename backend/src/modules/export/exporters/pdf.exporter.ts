import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { otherAnswerKey } from "@quorvia/shared-types";
import { ExportData, Exporter, GeneratedFile } from "./exporter.types.js";
import { AnswerValue, formatAnswer, slugifyFileName } from "./formatAnswer.js";

const PAGE_BOTTOM_MARGIN = 70;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONT_PATH = path.join(__dirname, "../../../fonts/DejaVuSans.ttf");

export const exportToPdf: Exporter = (data: ExportData): Promise<GeneratedFile> => {
  return new Promise((resolve, reject) => {
    const questions = [...data.questions].sort((a, b) => a.order - b.order);

    const doc = new PDFDocument({
      margin: 50,
      size: "A4",
      bufferPages: true,
    });

    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));

    doc.on("error", reject);

    doc.on("end", () => {
      resolve({
        buffer: Buffer.concat(chunks),
        fileName: `${slugifyFileName(data.form.title)}-responses.pdf`,
        mimeType: "application/pdf",
      });
    });

    doc.font(FONT_PATH);

    doc.fontSize(20).text(data.form.title, { align: "left" });

    if (data.form.description) {
      doc.moveDown(0.5).fontSize(11).fillColor("#555").text(data.form.description);

      doc.fillColor("black");
    }

    doc
      .moveDown(1)
      .fontSize(11)
      .text(`Кількість запитань: ${questions.length}`)
      .text(`Кількість відповідей: ${data.responses.length}`)
      .text(`Дата формування звіту: ${new Date().toLocaleString("uk-UA")}`);

    doc.moveDown(1.5);

    if (data.responses.length === 0) {
      doc.fontSize(12).text("Форма ще не має жодної відповіді.");
    }

    data.responses.forEach((response, index) => {
      const estimatedHeight = 30 + questions.length * 22;

      if (doc.y + estimatedHeight > doc.page.height - PAGE_BOTTOM_MARGIN) {
        doc.addPage();
      }

      doc
        .fontSize(13)
        .fillColor("#111")
        .text(`Відповідь №${index + 1} · ${response.createdAt.toLocaleString("uk-UA")}`, {
          underline: true,
        });

      doc.moveDown(0.3);

      const answers = response.answers as Record<string, AnswerValue>;

      questions.forEach((question) => {
        const value = formatAnswer(question, answers[question.id], answers[otherAnswerKey(question.id)]) || "—";

        doc.fontSize(10).fillColor("#555").text(question.text);

        doc.fontSize(11).fillColor("black").text(value);

        doc.moveDown(0.4);
      });

      doc.moveDown(0.6);

      if (index < data.responses.length - 1) {
        doc
          .moveTo(doc.x, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .strokeColor("#ddd")
          .stroke();

        doc.moveDown(0.6);
      }
    });

    doc.end();
  });
};
