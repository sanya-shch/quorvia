import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FormCard from "./FormCard";
import type { FormSummary } from "../../../types/form";

vi.mock("./FormCardMenu", () => ({ default: () => null }));

const HOUR_MS = 60 * 60 * 1000;

const summary = (overrides: Partial<FormSummary> = {}): FormSummary => ({
  id: "f1",
  title: "Опитування",
  isPublished: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  shareId: "share-1",
  _count: { questions: 3, responses: 5 },
  ...overrides,
});

const renderCard = (form: FormSummary) =>
  render(
    <FormCard
      form={form}
      onClick={vi.fn()}
      onDelete={vi.fn()}
      onTogglePublish={vi.fn()}
      onDuplicate={vi.fn()}
      onAnalytics={vi.fn()}
    />,
  );

describe("FormCard - closed badge", () => {
  it("is absent for an open published form", () => {
    renderCard(
      summary({
        closesAt: new Date(Date.now() + HOUR_MS).toISOString(),
        maxResponses: 10,
        responseCount: 3,
      }),
    );

    expect(screen.queryByText("Закрито")).not.toBeInTheDocument();
  });

  it("shows for a form past its closing date, with the reason", () => {
    renderCard(summary({ closesAt: new Date(Date.now() - HOUR_MS).toISOString() }));

    expect(screen.getByText("Закрито")).toHaveAttribute("title", "Дата закриття минула");
  });

  it("shows for a form that reached its limit", () => {
    renderCard(summary({ maxResponses: 5, responseCount: 5 }));

    expect(screen.getByText("Закрито")).toHaveAttribute(
      "title",
      "Досягнуто максимальної кількості відповідей",
    );
  });

  it("is not shown for a draft", () => {
    renderCard(summary({ isPublished: false, maxResponses: 1, responseCount: 9 }));

    expect(screen.queryByText("Закрито")).not.toBeInTheDocument();
  });
});
