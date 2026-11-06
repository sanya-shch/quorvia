import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import PublicFormPage from "./PublicFormPage";
import i18n, { I18N_LOCALSTORAGE_KEY } from "../../i18n";
import { fetchPublicForm, submitFormResponses, saveFormAttempt } from "../../api/publicFormApi";
import type { PublicFormFields } from "../../api/publicFormApi";

vi.mock("../../api/publicFormApi", () => ({
  fetchPublicForm: vi.fn(),
  submitFormResponses: vi.fn(),
  saveFormAttempt: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchPublicForm);
const mockedSubmit = vi.mocked(submitFormResponses);

const form = (overrides: Partial<PublicFormFields> = {}): PublicFormFields => ({
  id: "form-1",
  title: "Опитування",
  description: "Опис форми",
  responseMode: "ALL_AT_ONCE",
  defaultLanguage: "uk",
  languages: ["en", "pl"],
  translations: {
    en: { title: "Survey" },
    pl: { title: "Ankieta" },
  },
  questions: [
    {
      id: "q1",
      order: 0,
      type: "TEXT",
      text: "Ім'я",
      required: false,
      options: [],
      config: null,
      translations: { en: { text: "Name" }, pl: { text: "Imię" } },
    },
    {
      id: "q2",
      order: 1,
      type: "CHOICE_SINGLE",
      text: "Напій",
      required: false,
      options: [
        { id: "o1", text: "Кава", isDefault: false },
        { id: "o2", text: "Чай", isDefault: false },
      ],
      config: { displayVariant: "list" },
      translations: { en: { text: "Drink", options: { o1: "Coffee" } } },
    },
  ],
  ...overrides,
});

function LocationProbe() {
  return <output data-testid="search">{useLocation().search}</output>;
}

const renderPage = (search = "") => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/f/share-1${search}`]}>
        <LocationProbe />
        <Routes>
          <Route path="/f/:shareId" element={<PublicFormPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const setBrowserLanguages = (languages: string[]) =>
  Object.defineProperty(window.navigator, "languages", { value: languages, configurable: true });

describe("PublicFormPage - мови форми", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedSubmit.mockReset();
    mockedSubmit.mockResolvedValue(undefined);
    vi.mocked(saveFormAttempt).mockResolvedValue(undefined);
    mockedFetch.mockResolvedValue(form());
    setBrowserLanguages(["uk-UA"]);
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, "languages", { value: ["en-US"], configurable: true });
  });

  it("без ?lang= і з браузером uk показує основну мову та перемикач", async () => {
    renderPage();

    expect(await screen.findByText("Ім'я")).toBeInTheDocument();
    expect(screen.getByText("Опитування")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Мова" })).toHaveValue("uk");
  });

  it("?lang=en показує переклад; непереклад(ений) варіант лишається основною мовою", async () => {
    renderPage("?lang=en");

    expect(await screen.findByText("Survey")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Drink")).toBeInTheDocument();
    expect(screen.getByLabelText("Coffee")).toBeInTheDocument();
    // the "Tea" option has no translation: shown in the main language, not empty
    expect(screen.getByLabelText("Чай")).toBeInTheDocument();
    // the description has no translation either: the main one
    expect(screen.getByText("Опис форми")).toBeInTheDocument();
  });

  it("службові тексти - мовою форми (кнопка англійською при ?lang=en)", async () => {
    renderPage("?lang=en");

    expect(await screen.findByRole("button", { name: "Submit answers" })).toBeInTheDocument();
  });

  it("мова без власного інтерфейсу (pl): вміст польською, службові тексти англійською", async () => {
    renderPage("?lang=pl");

    expect(await screen.findByText("Ankieta")).toBeInTheDocument();
    expect(screen.getByText("Imię")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit answers" })).toBeInTheDocument();
  });

  it("без ?lang= береться мова браузера (en-GB -> en)", async () => {
    setBrowserLanguages(["de-DE", "en-GB"]);
    renderPage();

    expect(await screen.findByText("Survey")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveValue("en");
  });

  it("явний ?lang= важливіший за мову браузера", async () => {
    setBrowserLanguages(["en-US"]);
    renderPage("?lang=pl");

    expect(await screen.findByText("Ankieta")).toBeInTheDocument();
  });

  it("невідома мова в ?lang= та в браузері - основна мова форми", async () => {
    setBrowserLanguages(["fr-FR"]);
    renderPage("?lang=de");

    expect(await screen.findByText("Опитування")).toBeInTheDocument();
  });

  it("перемикач змінює мову, пише її в адресу й не губить уже введені відповіді", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("Ім'я"), "Олена");
    await user.click(screen.getByLabelText("Чай"));

    await user.selectOptions(screen.getByRole("combobox", { name: "Мова" }), "en");

    expect(await screen.findByText("Survey")).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent("?lang=en");
    // the form was not remounted: typed and selected values are kept
    expect(screen.getByLabelText("Name")).toHaveValue("Олена");
    expect(screen.getByLabelText("Чай")).toBeChecked();
  });

  it("мова відправляється разом з відповідями", async () => {
    const user = userEvent.setup();
    renderPage("?lang=en");

    await user.type(await screen.findByLabelText("Name"), "Olena");
    await user.click(screen.getByRole("button", { name: "Submit answers" }));

    expect(mockedSubmit).toHaveBeenCalledWith(
      "share-1",
      { q1: "Olena" },
      expect.any(String),
      "en",
    );
  });

  it("після відправки подяка - мовою форми", async () => {
    const user = userEvent.setup();
    renderPage("?lang=en");

    await user.click(await screen.findByRole("button", { name: "Submit answers" }));

    expect(await screen.findByText("Thank you!")).toBeInTheDocument();
  });

  it("атрибут lang виставлено на вміст багатомовної форми", async () => {
    const { container } = renderPage("?lang=pl");

    await screen.findByText("Ankieta");

    expect(container.querySelector('[lang="pl"]')).not.toBeNull();
  });

  it("вибір мови респондентом не змінює мову застосунку й не пишеться в localStorage", async () => {
    // an explicit initial value: otherwise "unchanged" would also be true for null
    localStorage.setItem(I18N_LOCALSTORAGE_KEY, "uk");
    const appLanguage = i18n.language;

    renderPage("?lang=en");
    await screen.findByText("Survey");

    expect(i18n.language).toBe(appLanguage);
    expect(localStorage.getItem(I18N_LOCALSTORAGE_KEY)).toBe("uk");
  });

  it("покроковий режим теж локалізований", async () => {
    mockedFetch.mockResolvedValue(form({ responseMode: "STEP_BY_STEP" }));
    renderPage("?lang=en");

    expect(await screen.findByText("Name")).toBeInTheDocument();
    expect(screen.queryByText("Ім'я")).not.toBeInTheDocument();
  });
});

describe("PublicFormPage - одномовна форма без змін у поведінці", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedSubmit.mockReset();
    mockedSubmit.mockResolvedValue(undefined);
    vi.mocked(saveFormAttempt).mockResolvedValue(undefined);
    setBrowserLanguages(["uk-UA"]);
  });

  it("без додаткових мов: немає перемикача й атрибута lang, мова у відправці не передається", async () => {
    mockedFetch.mockResolvedValue(form({ languages: [], translations: null }));
    const user = userEvent.setup();
    const { container } = renderPage("?lang=en");

    expect(await screen.findByText("Ім'я")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(container.querySelector("[lang]")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Надіслати відповіді" }));

    expect(mockedSubmit).toHaveBeenCalledWith("share-1", {}, expect.any(String), undefined);
  });

  it("відповідь старого сервера (без полів мов) працює як одномовна форма", async () => {
    mockedFetch.mockResolvedValue(
      form({ defaultLanguage: undefined, languages: undefined, translations: undefined }),
    );
    renderPage();

    expect(await screen.findByText("Ім'я")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("службові тексти одномовної форми - мовою застосунку, а не мовою форми", async () => {
    // defaultLanguage="uk" is only a default: an English form must not suddenly get a Ukrainian interface.
    await i18n.changeLanguage("en");

    try {
      mockedFetch.mockResolvedValue(form({ languages: [], translations: null }));
      renderPage();

      expect(await screen.findByRole("button", { name: "Submit answers" })).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage("uk");
    }
  });
});
