import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FormBuilder from "./FormBuilder";
import { formsApi } from "../../api/forms";
import { ToastProvider } from "../../components/ui/Toast";
import type { AdminForm } from "../../types/formBuilder";

vi.mock("../../api/forms", () => ({
  formsApi: { getAdminForm: vi.fn(), update: vi.fn() },
}));

const mockedGet = vi.mocked(formsApi.getAdminForm);
const mockedUpdate = vi.mocked(formsApi.update);

const adminForm = (overrides: Partial<AdminForm> = {}): AdminForm => ({
  title: "Опитування",
  description: "Опис форми",
  responseMode: "ALL_AT_ONCE",
  version: 1,
  defaultLanguage: "uk",
  languages: [],
  translations: null,
  questions: [
    {
      id: "c",
      order: 0,
      type: "CHOICE_SINGLE",
      text: "Напій",
      required: false,
      options: [
        { id: "o1", text: "Кава", isDefault: false },
        { id: "o2", text: "Чай", isDefault: false },
      ],
      config: { displayVariant: "list" },
    },
  ],
  ...overrides,
});

const renderBuilder = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/forms/form-1/edit"]}>
          <Routes>
            <Route path="/forms/:formId/edit" element={<FormBuilder />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

const languageBar = async () => within(await screen.findByRole("region", { name: "Мови форми" }));

describe("FormBuilder - мови контенту", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedGet.mockResolvedValue(adminForm());
    mockedUpdate.mockResolvedValue({ success: true, version: 2 });
  });

  it("показує основну мову як вибрану вкладку і структуру форми", async () => {
    renderBuilder();
    const bar = await languageBar();

    expect(bar.getByRole("button", { name: /Українська/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("Опитування")).toBeVisible();
  });

  it("додає мову: з'являється вкладка, відкривається панель перекладу, структуру приховано", async () => {
    const user = userEvent.setup();
    renderBuilder();
    const bar = await languageBar();

    await user.selectOptions(bar.getByRole("combobox", { name: "Додати мову перекладу" }), "en");

    expect(bar.getByRole("button", { name: /Англійська/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Переклад: Англійська" })).toBeInTheDocument();
    // the title field in the main language is hidden together with the structure
    expect(screen.getByDisplayValue("Опитування")).not.toBeVisible();
    expect(screen.queryByRole("button", { name: /Додати питання/ })).not.toBeInTheDocument();
  });

  it("лічильник «не перекладено» на вкладці зменшується, коли поле перекладено", async () => {
    const user = userEvent.setup();
    renderBuilder();
    const bar = await languageBar();

    await user.selectOptions(bar.getByRole("combobox", { name: "Додати мову перекладу" }), "en");

    // title, description, question, 2 options
    expect(bar.getByLabelText("Не перекладено: 5")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Переклад (Англійська): Заголовок"), "Survey");

    expect(bar.getByLabelText("Не перекладено: 4")).toBeInTheDocument();
  });

  it("переклад зберігається у вкладці, а повернення на основну мову показує структуру", async () => {
    const user = userEvent.setup();
    renderBuilder();
    const bar = await languageBar();

    await user.selectOptions(bar.getByRole("combobox", { name: "Додати мову перекладу" }), "en");
    await user.type(screen.getByLabelText("Переклад (Англійська): Текст питання"), "Drink");
    await user.click(bar.getByRole("button", { name: /Українська/ }));

    expect(screen.getByDisplayValue("Опитування")).toBeVisible();

    await user.click(bar.getByRole("button", { name: /Англійська/ }));
    expect(screen.getByLabelText("Переклад (Англійська): Текст питання")).toHaveValue("Drink");
  });

  it("«Скопіювати відсутні з основної» заповнює порожні поля і вимикається", async () => {
    const user = userEvent.setup();
    renderBuilder();
    const bar = await languageBar();

    await user.selectOptions(bar.getByRole("combobox", { name: "Додати мову перекладу" }), "en");
    await user.click(screen.getByRole("button", { name: "Скопіювати відсутні з основної мови" }));

    expect(screen.getByLabelText("Переклад (Англійська): Заголовок")).toHaveValue("Опитування");
    expect(screen.getByText("Усе перекладено")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скопіювати відсутні з основної мови" })).toBeDisabled();
  });

  it("зберігання надсилає основну мову, список мов і переклади форми та питання", async () => {
    const user = userEvent.setup();
    renderBuilder();
    const bar = await languageBar();

    await user.selectOptions(bar.getByRole("combobox", { name: "Додати мову перекладу" }), "en");
    await user.type(screen.getByLabelText("Переклад (Англійська): Заголовок"), "Survey");
    await user.type(screen.getByLabelText("Переклад (Англійська): Текст питання"), "Drink");
    await user.click(screen.getByRole("button", { name: "Зберегти форму" }));

    expect(mockedUpdate).toHaveBeenCalledTimes(1);

    const payload = mockedUpdate.mock.calls[0][1];

    expect(payload.defaultLanguage).toBe("uk");
    expect(payload.languages).toEqual(["en"]);
    expect(payload.translations).toEqual({ en: { title: "Survey" } });
    expect(payload.questions[0].translations).toEqual({ en: { text: "Drink" } });
  });

  it("завантажена форма з перекладами показує вкладки й лічильники", async () => {
    mockedGet.mockResolvedValue(
      adminForm({
        languages: ["en", "pl"],
        translations: { en: { title: "Survey", description: "Desc" } },
        questions: [
          {
            ...adminForm().questions[0],
            translations: {
              en: { text: "Drink", options: { o1: "Coffee", o2: "Tea" } },
            },
          },
        ],
      }),
    );

    renderBuilder();
    const bar = await languageBar();

    // English is fully translated: no badge; Polish has 5 empty fields
    expect(bar.getByRole("button", { name: /Англійська/ })).not.toHaveTextContent(/\d/);
    expect(bar.getByLabelText("Не перекладено: 5")).toBeInTheDocument();
  });

  it("видалення мови потребує підтвердження і прибирає вкладку та переклади", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(
      adminForm({ languages: ["en"], translations: { en: { title: "Survey" } } }),
    );

    renderBuilder();
    const bar = await languageBar();

    await user.click(bar.getByRole("button", { name: /Англійська/ }));
    await user.click(screen.getByRole("button", { name: "Видалити мову" }));

    expect(screen.getByText("Видалити мову «Англійська»?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Видалити" }));

    expect(bar.queryByRole("button", { name: /Англійська/ })).not.toBeInTheDocument();
    // after deleting the active tab we return to the main language
    expect(screen.getByDisplayValue("Опитування")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Зберегти форму" }));
    const payload = mockedUpdate.mock.calls[0][1];

    expect(payload.languages).toEqual([]);
    expect(payload.translations).toBeNull();
  });

  it("скасування видалення нічого не змінює", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(adminForm({ languages: ["en"] }));

    renderBuilder();
    const bar = await languageBar();

    await user.click(bar.getByRole("button", { name: /Англійська/ }));
    await user.click(screen.getByRole("button", { name: "Видалити мову" }));
    await user.click(screen.getByRole("button", { name: "Скасувати" }));

    expect(bar.getByRole("button", { name: /Англійська/ })).toBeInTheDocument();
  });

  it("основну мову не можна обрати серед уже доданих", async () => {
    mockedGet.mockResolvedValue(adminForm({ languages: ["en"] }));

    renderBuilder();
    const bar = await languageBar();
    const mainSelect = bar.getByRole("combobox", { name: "Форма написана" });
    const values = within(mainSelect)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);

    expect(values).not.toContain("en");
    expect(values).toContain("uk");
    expect(values).toContain("pl");
  });

  it("зміна основної мови позначає форму змінено й надсилається на збереження", async () => {
    const user = userEvent.setup();
    renderBuilder();
    const bar = await languageBar();

    await user.selectOptions(bar.getByRole("combobox", { name: "Форма написана" }), "en");
    await user.click(screen.getByRole("button", { name: "Зберегти форму" }));

    expect(mockedUpdate.mock.calls[0][1].defaultLanguage).toBe("en");
  });

  it("форма без полів мов (старий сервер) не ламає редактор і не шле зайвого", async () => {
    mockedGet.mockResolvedValue(
      adminForm({ defaultLanguage: undefined, languages: undefined, translations: undefined }),
    );

    const user = userEvent.setup();
    renderBuilder();
    await languageBar();

    await user.type(screen.getByDisplayValue("Опитування"), "!");
    await user.click(screen.getByRole("button", { name: "Зберегти форму" }));

    const payload = mockedUpdate.mock.calls[0][1];

    expect(payload.languages).toEqual([]);
    expect(payload.translations).toBeNull();
  });
});
