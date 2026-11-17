import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicFormPage from "./PublicFormPage";
import { fetchPublicForm, saveFormAttempt, submitFormResponses } from "../../api/publicFormApi";
import type { PublicFormFields } from "../../api/publicFormApi";

vi.mock("../../api/publicFormApi", () => ({
  fetchPublicForm: vi.fn(),
  submitFormResponses: vi.fn(),
  saveFormAttempt: vi.fn(),
}));

vi.mock("../../api/assets", () => ({ assetUrl: (id: string) => `http://api.test/assets/${id}` }));

const mockedFetch = vi.mocked(fetchPublicForm);
const mockedSubmit = vi.mocked(submitFormResponses);
const mockedSave = vi.mocked(saveFormAttempt);

const openForm = (overrides: Partial<PublicFormFields> = {}): PublicFormFields => ({
  id: "form-1",
  title: "Опитування",
  responseMode: "ALL_AT_ONCE",
  questions: [
    { id: "q1", order: 0, type: "TEXT", text: "Ім'я", required: false, options: [], config: null },
  ],
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

const quotaRefusal = (message: string | null) => ({
  response: { status: 409, data: { message: "QUOTA_FULL", errors: { message } } },
});

const SUBMIT = "Надіслати відповіді";

describe("a respondent whose group is full", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedSubmit.mockReset();
    mockedSave.mockReset();
    mockedSave.mockResolvedValue(undefined as never);
  });

  const submit = async () => {
    const user = userEvent.setup();

    mockedFetch.mockResolvedValue(openForm());
    renderPage();
    await user.click(await screen.findByRole("button", { name: SUBMIT }));
  };

  it("is shown the owner's message instead of the form", async () => {
    mockedSubmit.mockRejectedValue(quotaRefusal("Для Києва місць більше немає"));

    await submit();

    expect(await screen.findByRole("heading", { name: "Місць більше немає" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Для Києва місць більше немає");
    expect(screen.getAllByText("Опитування").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: SUBMIT })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("is shown the standard text when the owner gave no message", async () => {
    mockedSubmit.mockRejectedValue(quotaRefusal(null));

    await submit();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "не приймає відповіді від вашої групи респондентів",
    );
  });

  it("is told in the respondent's language, with the title translated", async () => {
    const user = userEvent.setup();

    mockedFetch.mockResolvedValue(
      openForm({
        defaultLanguage: "uk",
        languages: ["en"],
        translations: { en: { title: "Customer survey" } },
      }),
    );
    mockedSubmit.mockRejectedValue(quotaRefusal(null));
    renderPage("?lang=en");

    await user.click(await screen.findByRole("button", { name: "Submit answers" }));

    expect(await screen.findByRole("heading", { name: "No places left" })).toBeInTheDocument();
    expect(screen.getAllByText("Customer survey").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("no longer accepting answers");
  });

  it("does not get the end screen or a closed page", async () => {
    mockedSubmit.mockRejectedValue(quotaRefusal(null));

    await submit();

    await screen.findByRole("heading", { name: "Місць більше немає" });

    expect(screen.queryByRole("heading", { name: "Опитування закрито" })).not.toBeInTheDocument();
    expect(screen.queryByText("Дякуємо!")).not.toBeInTheDocument();
  });

  it("keeps the form for any other failure", async () => {
    mockedSubmit.mockRejectedValue({
      response: { status: 500, data: { message: "INTERNAL_SERVER_ERROR" } },
    });

    await submit();

    expect(await screen.findByRole("button", { name: SUBMIT })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Місць більше немає" })).not.toBeInTheDocument();
  });
});

describe("the early warning while filling the form", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedFetch.mockReset();
    mockedSubmit.mockReset();
    mockedSave.mockReset();
  });

  const afterAutosave = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });

  it("warns as soon as the autosave says the answers fall into a full quota", async () => {
    mockedFetch.mockResolvedValue(openForm());
    mockedSave.mockResolvedValue({
      id: "a",
      updatedAt: "x",
      quotaFull: { message: "Для Києва місць немає" },
    });
    renderPage();
    await screen.findByText("Ім'я");

    await afterAutosave();

    expect(await screen.findByRole("alert")).toHaveTextContent("Для Києва місць немає");
    // The form stays: the respondent may change an answer, and the server decides at the submit.
    expect(screen.getByRole("button", { name: SUBMIT })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("uses the standard warning without an owner's message", async () => {
    mockedFetch.mockResolvedValue(openForm());
    mockedSave.mockResolvedValue({ id: "a", updatedAt: "x", quotaFull: { message: null } });
    renderPage();
    await screen.findByText("Ім'я");

    await afterAutosave();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "місць уже немає, тому надіслати відповіді не вдасться",
    );
  });

  it("takes the warning back when later answers fall into no full quota", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockedFetch.mockResolvedValue(openForm());
    mockedSave
      .mockResolvedValueOnce({ id: "a", updatedAt: "x", quotaFull: { message: null } })
      .mockResolvedValue({ id: "a", updatedAt: "x", quotaFull: null });
    renderPage();
    await screen.findByText("Ім'я");
    await afterAutosave();
    await screen.findByRole("alert");

    await user.type(screen.getByRole("textbox"), "Олена");
    await afterAutosave();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows nothing when there is no full quota, or the server predates quotas", async () => {
    mockedFetch.mockResolvedValue(openForm());
    mockedSave.mockResolvedValue({ id: "a", updatedAt: "x" });
    renderPage();
    await screen.findByText("Ім'я");

    await afterAutosave();

    expect(mockedSave).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a failed autosave neither warns nor disturbs the respondent", async () => {
    mockedFetch.mockResolvedValue(openForm());
    mockedSave.mockRejectedValue(new Error("offline"));
    renderPage();
    await screen.findByText("Ім'я");

    await afterAutosave();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: SUBMIT })).toBeInTheDocument();
  });
});
