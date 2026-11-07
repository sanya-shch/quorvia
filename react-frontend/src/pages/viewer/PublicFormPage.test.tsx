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

  it.each(["ALL_AT_ONCE", "STEP_BY_STEP"] as const)("%s: shows the logo above the title when the form has one", async (responseMode) => {
    mockedFetchPublicForm.mockResolvedValue({
      id: "form-1",
      title: "Тестова форма",
      responseMode,
      logoAssetId: "asset-7",
      questions: [baseQuestion],
    });

    const { container } = renderPage();

    await screen.findByText("Перше питання");

    const logo = container.querySelector("img");
    expect(logo).toHaveAttribute("src", expect.stringMatching(/\/assets\/asset-7$/));
    // Decorative: the title next to it already names the form.
    expect(logo).toHaveAttribute("alt", "");
  });

  it("applies the form theme to the public page only", async () => {
    mockedFetchPublicForm.mockResolvedValue({
      id: "form-1",
      title: "Тестова форма",
      responseMode: "ALL_AT_ONCE",
      theme: { mode: "dark", primaryColor: "#FF0000", radius: "none" },
      questions: [baseQuestion],
    });

    const { container } = renderPage();

    await screen.findByText("Перше питання");

    const scope = container.querySelector<HTMLElement>(".q-theme")!;
    expect(scope).toContainElement(screen.getByText("Перше питання"));
    expect(scope.style.getPropertyValue("--q-primary")).toBe("#ff0000");
    expect(scope.dataset.qRadius).toBe("none");
  });

  it("renders a form without a theme exactly as before", async () => {
    mockedFetchPublicForm.mockResolvedValue({
      id: "form-1",
      title: "Тестова форма",
      responseMode: "ALL_AT_ONCE",
      theme: null,
      questions: [baseQuestion],
    });

    const { container } = renderPage();

    await screen.findByText("Перше питання");

    expect(container.querySelector(".q-theme")).toBeNull();
  });

  it("ignores hostile values in a stored theme", async () => {
    mockedFetchPublicForm.mockResolvedValue({
      id: "form-1",
      title: "Тестова форма",
      responseMode: "ALL_AT_ONCE",
      theme: { primaryColor: "#fff; background:url(//evil.test)", textColor: "#000000" },
      questions: [baseQuestion],
    });

    const { container } = renderPage();

    await screen.findByText("Перше питання");

    expect(container.querySelector(".q-theme")!.getAttribute("style")).not.toContain("evil");
  });

  it("renders no image for a form without a logo", async () => {
    mockedFetchPublicForm.mockResolvedValue({
      id: "form-1",
      title: "Тестова форма",
      responseMode: "ALL_AT_ONCE",
      logoAssetId: null,
      questions: [baseQuestion],
    });

    const { container } = renderPage();

    await screen.findByText("Перше питання");

    expect(container.querySelector("img")).toBeNull();
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
