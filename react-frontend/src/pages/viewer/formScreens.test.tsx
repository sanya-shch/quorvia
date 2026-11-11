import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicFormPage from "./PublicFormPage";
import { REDIRECT_DELAY_SECONDS } from "./components/EndScreen";
import { fetchPublicForm, saveFormAttempt, submitFormResponses } from "../../api/publicFormApi";
import type { PublicFormFields } from "../../api/publicFormApi";
import { redirectTo } from "./navigation";

vi.mock("../../api/publicFormApi", () => ({
  fetchPublicForm: vi.fn(),
  submitFormResponses: vi.fn(),
  saveFormAttempt: vi.fn(),
}));

vi.mock("../../api/assets", () => ({ assetUrl: (id: string) => `http://api.test/assets/${id}` }));

vi.mock("./navigation", () => ({ redirectTo: vi.fn() }));

const mockedFetch = vi.mocked(fetchPublicForm);
const mockedSubmit = vi.mocked(submitFormResponses);
const mockedRedirect = vi.mocked(redirectTo);

const form = (overrides: Partial<PublicFormFields> = {}): PublicFormFields => ({
  id: "form-1",
  title: "Опитування",
  responseMode: "ALL_AT_ONCE",
  questions: [
    {
      id: "q1",
      order: 0,
      type: "TEXT",
      text: "Ім'я",
      required: false,
      options: [],
      config: null,
    },
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

const submit = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: "Надіслати відповіді" }));
};

describe("welcome screen", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedSubmit.mockReset();
    mockedSubmit.mockResolvedValue({ success: true } as never);
    vi.mocked(saveFormAttempt).mockResolvedValue(undefined as never);
  });

  it("is shown first, and the form is not rendered until the respondent starts", async () => {
    mockedFetch.mockResolvedValue(
      form({ welcomeScreen: { title: "Вітаємо!", text: "Це займе хвилину." } }),
    );
    renderPage();

    expect(await screen.findByRole("heading", { name: "Вітаємо!" })).toBeInTheDocument();
    expect(screen.getByText("Це займе хвилину.")).toBeInTheDocument();
    expect(screen.queryByText("Ім'я")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Надіслати відповіді" })).not.toBeInTheDocument();
  });

  it("shows the form after the button is pressed", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValue(form({ welcomeScreen: { title: "Вітаємо!" } }));
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Почати" }));

    expect(await screen.findByText("Ім'я")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Вітаємо!" })).not.toBeInTheDocument();
  });

  it("uses the author's button label when there is one", async () => {
    mockedFetch.mockResolvedValue(form({ welcomeScreen: { title: "Hi", buttonLabel: "Поїхали" } }));
    renderPage();

    expect(await screen.findByRole("button", { name: "Поїхали" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Почати" })).not.toBeInTheDocument();
  });

  it("works in the step-by-step mode too", async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValue(
      form({ responseMode: "STEP_BY_STEP", welcomeScreen: { title: "Вітаємо!" } }),
    );
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Почати" }));

    expect(await screen.findByText("Ім'я")).toBeInTheDocument();
  });

  it("shows the logo of the form", async () => {
    mockedFetch.mockResolvedValue(
      form({ logoAssetId: "logo-1", welcomeScreen: { title: "Вітаємо!" } }),
    );
    const { container } = renderPage();

    await screen.findByRole("heading", { name: "Вітаємо!" });

    expect(container.querySelector("img")).toHaveAttribute("src", "http://api.test/assets/logo-1");
  });

  it("is absent for a form without one: the questions come right away", async () => {
    mockedFetch.mockResolvedValue(form());
    renderPage();

    expect(await screen.findByText("Ім'я")).toBeInTheDocument();
  });

  it("is shown in the language the respondent chose", async () => {
    mockedFetch.mockResolvedValue(
      form({
        defaultLanguage: "uk",
        languages: ["en"],
        welcomeScreen: { title: "Вітаємо!", text: "Опис", buttonLabel: "Поїхали" },
        translations: { en: { welcomeTitle: "Welcome!", welcomeButton: "Let's go" } },
      }),
    );
    renderPage("?lang=en");

    expect(await screen.findByRole("heading", { name: "Welcome!" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Let's go" })).toBeInTheDocument();
    // Untranslated fields fall back to the main language.
    expect(screen.getByText("Опис")).toBeInTheDocument();
  });
});

describe("end screen", () => {
  const answerAndSubmit = async (overrides: Partial<PublicFormFields>) => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValue(form(overrides));
    const view = renderPage();

    await submit(user);

    return view;
  };

  beforeEach(() => {
    mockedFetch.mockReset();
    mockedSubmit.mockReset();
    mockedSubmit.mockResolvedValue({ success: true } as never);
    vi.mocked(saveFormAttempt).mockResolvedValue(undefined as never);
    mockedRedirect.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the standard thank-you message when the form has none", async () => {
    await answerAndSubmit({});

    expect(await screen.findByText("Дякуємо!")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the author's message instead", async () => {
    await answerAndSubmit({ endScreen: { text: "Ми з вами зв'яжемося." } });

    expect(await screen.findByRole("status")).toHaveTextContent("Ми з вами зв'яжемося.");
    expect(screen.queryByText("Дякуємо!")).not.toBeInTheDocument();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("is shown in the respondent's language with a fallback", async () => {
    mockedFetch.mockResolvedValue(
      form({
        defaultLanguage: "uk",
        languages: ["en"],
        endScreen: { text: "Дякуємо за відповіді." },
        translations: { en: { endText: "Thank you for your answers." } },
      }),
    );
    const user = userEvent.setup();
    renderPage("?lang=en");

    await user.click(await screen.findByRole("button", { name: "Submit answers" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Thank you for your answers.");
  });

  it("redirects after the delay, counting down, with a link to go at once", async () => {
    await answerAndSubmit({
      endScreen: { text: "Дякуємо", redirectUrl: "https://example.com/next" },
    });

    expect(await screen.findByText(/Перехід через 5 секунд/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти зараз" })).toHaveAttribute(
      "href",
      "https://example.com/next",
    );
    expect(mockedRedirect).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync((REDIRECT_DELAY_SECONDS - 1) * 1000);
    });
    expect(mockedRedirect).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(mockedRedirect).toHaveBeenCalledTimes(1);
    expect(mockedRedirect).toHaveBeenCalledWith("https://example.com/next");
  });

  it("opens the link safely (no opener, no referrer leak of the opener)", async () => {
    await answerAndSubmit({
      endScreen: { text: "Дякуємо", redirectUrl: "https://example.com/next" },
    });

    expect(await screen.findByRole("link", { name: "Перейти зараз" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it.each([
    "javascript:alert(document.cookie)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.test/phish",
    "/relative",
  ])("never follows or links %j, even if it slipped past the server", async (redirectUrl) => {
    await answerAndSubmit({ endScreen: { text: "Дякуємо", redirectUrl } });

    await screen.findByRole("status");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REDIRECT_DELAY_SECONDS * 1000 + 2000);
    });

    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Перехід через/)).not.toBeInTheDocument();
  });

  it("does not leave before the respondent has submitted", async () => {
    mockedFetch.mockResolvedValue(
      form({ endScreen: { text: "Дякуємо", redirectUrl: "https://example.com" } }),
    );
    renderPage();

    await screen.findByText("Ім'я");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  describe("the screen the server chose (conditional end screens)", () => {
    const serverSays = (endScreen: unknown) =>
      mockedSubmit.mockResolvedValue({
        id: "response-1",
        createdAt: "2026-11-11T10:00:00.000Z",
        endScreen,
      } as never);

    it("shows the screen of the rule that matched, not the form's own message", async () => {
      serverSays({ text: "Ви в нашій цільовій групі!" });

      await answerAndSubmit({ endScreen: { text: "Дякуємо за відповіді." } });

      expect(await screen.findByRole("status")).toHaveTextContent("Ви в нашій цільовій групі!");
      expect(screen.queryByText("Дякуємо за відповіді.")).not.toBeInTheDocument();
    });

    it("redirects to the address of that screen", async () => {
      serverSays({ text: "Чудово", redirectUrl: "https://example.com/great" });

      await answerAndSubmit({
        endScreen: { text: "Дякуємо", redirectUrl: "https://example.com/default" },
      });

      expect(await screen.findByRole("link", { name: "Перейти зараз" })).toHaveAttribute(
        "href",
        "https://example.com/great",
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(REDIRECT_DELAY_SECONDS * 1000 + 1100);
      });

      expect(mockedRedirect).toHaveBeenCalledTimes(1);
      expect(mockedRedirect).toHaveBeenCalledWith("https://example.com/great");
    });

    it("shows the standard thank-you when the server sent no screen", async () => {
      serverSays(null);

      await answerAndSubmit({});

      expect(await screen.findByText("Дякуємо!")).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("does not fall back to the form's screen when the server says there is none", async () => {
      // The server already considered the form's own screen; null is its answer.
      serverSays(null);

      await answerAndSubmit({ endScreen: { text: "Не має показатись" } });

      expect(await screen.findByText("Дякуємо!")).toBeInTheDocument();
      expect(screen.queryByText("Не має показатись")).not.toBeInTheDocument();
    });

    it("falls back to the form's own screen when the server sent nothing (an older server)", async () => {
      mockedSubmit.mockResolvedValue({ id: "response-1", createdAt: "x" } as never);

      await answerAndSubmit({ endScreen: { text: "Ми з вами зв'яжемося." } });

      expect(await screen.findByRole("status")).toHaveTextContent("Ми з вами зв'яжемося.");
    });

    it.each(["javascript:alert(1)", "data:text/html,<b>x</b>", "//evil.test/x"])(
      "never follows %j, even from the server",
      async (redirectUrl) => {
        serverSays({ text: "Чудово", redirectUrl });

        await answerAndSubmit({});

        await screen.findByRole("status");
        await act(async () => {
          await vi.advanceTimersByTimeAsync(REDIRECT_DELAY_SECONDS * 1000 + 2000);
        });

        expect(mockedRedirect).not.toHaveBeenCalled();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
      },
    );

    it("ignores a screen of the wrong shape and shows the standard message", async () => {
      serverSays({ text: 42 });

      await answerAndSubmit({});

      expect(await screen.findByText("Дякуємо!")).toBeInTheDocument();
    });
  });
});
