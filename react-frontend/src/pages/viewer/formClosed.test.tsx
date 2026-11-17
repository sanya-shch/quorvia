import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicFormPage from "./PublicFormPage";
import { fetchPublicForm, saveFormAttempt, submitFormResponses } from "../../api/publicFormApi";
import type { PublicFormFields, ClosedFormFields } from "../../api/publicFormApi";

vi.mock("../../api/publicFormApi", () => ({
  fetchPublicForm: vi.fn(),
  submitFormResponses: vi.fn(),
  saveFormAttempt: vi.fn(),
}));

vi.mock("../../api/assets", () => ({ assetUrl: (id: string) => `http://api.test/assets/${id}` }));

const mockedFetch = vi.mocked(fetchPublicForm);
const mockedSubmit = vi.mocked(submitFormResponses);

const openForm = (overrides: Partial<PublicFormFields> = {}): PublicFormFields => ({
  id: "form-1",
  title: "Опитування",
  responseMode: "ALL_AT_ONCE",
  questions: [
    { id: "q1", order: 0, type: "TEXT", text: "Ім'я", required: false, options: [], config: null },
  ],
  ...overrides,
});

const closedForm = (overrides: Partial<ClosedFormFields> = {}): ClosedFormFields => ({
  closedReason: "DATE",
  id: "form-1",
  title: "Опитування",
  ...overrides,
});

const renderPage = (search = "") =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[`/f/share-1${search}`]}>
        <Routes>
          <Route path="/f/:shareId" element={<PublicFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const refusal = (code: string) => ({ response: { status: 410, data: { message: code } } });

describe("a closed form", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedSubmit.mockReset();
    vi.mocked(saveFormAttempt).mockResolvedValue(undefined as never);
  });

  it("shows a closed page, not an error, when its closing date has passed", async () => {
    mockedFetch.mockResolvedValue(closedForm({ closedReason: "DATE" }));
    renderPage();

    expect(await screen.findByRole("heading", { name: "Опитування закрито" })).toBeInTheDocument();
    expect(screen.getAllByText("Опитування").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("термін його проведення минув");
  });

  it("says so when the limit of responses was reached", async () => {
    mockedFetch.mockResolvedValue(closedForm({ closedReason: "LIMIT" }));
    renderPage();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "досягнуто максимальної кількості відповідей",
    );
  });

  it("offers no questions and no submit button", async () => {
    mockedFetch.mockResolvedValue(closedForm());
    renderPage();

    await screen.findByRole("heading", { name: "Опитування закрито" });

    expect(screen.queryByRole("button", { name: "Надіслати відповіді" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps the author's branding: the logo and the theme", async () => {
    mockedFetch.mockResolvedValue(
      closedForm({ logoAssetId: "logo-1", theme: { mode: "dark", primaryColor: "#FF0000" } }),
    );
    const { container } = renderPage();

    await screen.findByRole("heading", { name: "Опитування закрито" });

    expect(container.querySelector("img")).toHaveAttribute("src", "http://api.test/assets/logo-1");
    const scope = container.querySelector<HTMLElement>(".q-theme");
    expect(scope).not.toBeNull();
    expect(scope!.style.getPropertyValue("--q-primary")).toBe("#ff0000");
  });

  it("speaks the respondent's language and translates the title", async () => {
    mockedFetch.mockResolvedValue(
      closedForm({
        defaultLanguage: "uk",
        languages: ["en"],
        translations: { en: { title: "Customer survey" } },
      }),
    );
    renderPage("?lang=en");

    expect(
      await screen.findByRole("heading", { name: "This survey is closed" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Customer survey").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("closing date has passed");
  });

  it("lets the respondent switch the language of a multilingual closed form", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValue(closedForm({ defaultLanguage: "uk", languages: ["en"] }));
    renderPage("?lang=uk");

    await screen.findByRole("heading", { name: "Опитування закрито" });
    await user.selectOptions(screen.getByRole("combobox"), "en");

    expect(
      await screen.findByRole("heading", { name: "This survey is closed" }),
    ).toBeInTheDocument();
  });
});

describe("a form that closes while it is being filled in", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedSubmit.mockReset();
    vi.mocked(saveFormAttempt).mockResolvedValue(undefined as never);
  });

  const submit = async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValue(openForm());
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Надіслати відповіді" }));
  };

  it.each([
    ["FORM_CLOSED_BY_DATE", "термін його проведення минув"],
    ["FORM_CLOSED_BY_LIMIT", "досягнуто максимальної кількості відповідей"],
  ])("replaces the form with the closed page on %s", async (code, message) => {
    mockedSubmit.mockRejectedValue(refusal(code));

    await submit();

    expect(await screen.findByRole("heading", { name: "Опитування закрито" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: "Надіслати відповіді" })).not.toBeInTheDocument();
  });

  it("keeps the form for any other failure", async () => {
    mockedSubmit.mockRejectedValue(refusal("INTERNAL_SERVER_ERROR"));

    await submit();

    expect(await screen.findByRole("button", { name: "Надіслати відповіді" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Опитування закрито" })).not.toBeInTheDocument();
  });

  it("an open form is shown as usual", async () => {
    mockedFetch.mockResolvedValue(openForm());
    renderPage();

    expect(await screen.findByText("Ім'я")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Опитування закрито" })).not.toBeInTheDocument();
  });
});
