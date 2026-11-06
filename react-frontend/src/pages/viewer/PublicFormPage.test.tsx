import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicFormPage from "./PublicFormPage";
import { fetchPublicForm } from "../../api/publicFormApi";

vi.mock("../../api/publicFormApi", () => ({
  fetchPublicForm: vi.fn(),
  submitFormResponses: vi.fn(),
}));

const mockedFetchPublicForm = vi.mocked(fetchPublicForm);

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/f/share-1"]}>
        <Routes>
          <Route path="/f/:shareId" element={<PublicFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const baseQuestion = {
  id: "q1",
  order: 0,
  type: "TEXT" as const,
  text: "Перше питання",
  required: false,
  options: [],
  config: null,
};

describe("PublicFormPage - responseMode визначає режим проходження (рішення автора форми)", () => {
  beforeEach(() => {
    mockedFetchPublicForm.mockReset();
  });

  it("responseMode: 'ALL_AT_ONCE' -> рендерить FormViewer (усі питання одразу)", async () => {
    mockedFetchPublicForm.mockResolvedValue({
      id: "form-1",
      title: "Тестова форма",
      responseMode: "ALL_AT_ONCE",
      questions: [baseQuestion, { ...baseQuestion, id: "q2", order: 1, text: "Друге питання" }],
    });

    renderPage();

    // FormViewer shows ALL questions at once
    expect(await screen.findByText("Перше питання")).toBeInTheDocument();
    expect(screen.getByText("Друге питання")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Надіслати відповіді" })).toBeInTheDocument();
  });

  it("responseMode: 'STEP_BY_STEP' -> рендерить QuestionStepper (по одному питанню)", async () => {
    mockedFetchPublicForm.mockResolvedValue({
      id: "form-1",
      title: "Тестова форма",
      responseMode: "STEP_BY_STEP",
      questions: [baseQuestion, { ...baseQuestion, id: "q2", order: 1, text: "Друге питання" }],
    });

    renderPage();

    // QuestionStepper shows only the FIRST question and the "Next" button
    expect(await screen.findByText("Перше питання")).toBeInTheDocument();
    expect(screen.queryByText("Друге питання")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далі →" })).toBeInTheDocument();
  });

  it("немає локального перемикача режиму - респондент більше не обирає сам", async () => {
    mockedFetchPublicForm.mockResolvedValue({
      id: "form-1",
      title: "Тестова форма",
      responseMode: "ALL_AT_ONCE",
      questions: [baseQuestion],
    });

    renderPage();

    await screen.findByText("Перше питання");

    expect(screen.queryByText("Усі питання")).not.toBeInTheDocument();
    expect(screen.queryByText("По одному")).not.toBeInTheDocument();
  });
});
