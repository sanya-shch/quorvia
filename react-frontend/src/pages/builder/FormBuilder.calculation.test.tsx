import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

vi.mock("../viewer/theme/fonts", () => ({
  useThemeFont: () => undefined,
  loadFont: () => Promise.resolve(),
}));

vi.mock("../../api/quotasApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/quotasApi")>()),
  quotasApi: { list: vi.fn().mockResolvedValue([]) },
}));

const mockedGet = vi.mocked(formsApi.getAdminForm);
const mockedUpdate = vi.mocked(formsApi.update);

const seats = {
  id: "q-seats",
  text: "Місць",
  type: "NUMBER" as const,
  required: false,
  order: 0,
  options: [],
  config: null,
};

const adminForm = (overrides: Partial<AdminForm> = {}): AdminForm => ({
  title: "Початкова",
  description: "",
  responseMode: "ALL_AT_ONCE",
  version: 1,
  questions: [seats],
  ...overrides,
});

const renderBuilder = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <MemoryRouter initialEntries={["/forms/form-1/edit"]}>
          <Routes>
            <Route path="/forms/:formId/edit" element={<FormBuilder />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole("button", { name: "Зберегти форму" }));

// Adds a calculation field after the first question through the "+" menu.
const addCalculation = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByDisplayValue("Початкова");
  await user.click(screen.getAllByRole("button", { name: "Додати питання сюди" }).at(-1)!);
  await user.click(screen.getByRole("menuitem", { name: /Обчислюване поле/ }));
};

describe("FormBuilder - calculation fields", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedUpdate.mockResolvedValue({ success: true, version: 2 });
    mockedGet.mockResolvedValue(adminForm());
  });

  it("adds a calculation field with the formula editor and no 'required' switch", async () => {
    const user = userEvent.setup();

    renderBuilder();
    await addCalculation(user);

    expect(screen.getByLabelText("Формула")).toBeInTheDocument();
    // Only the first question has the switch: a calculation is computed, never required.
    expect(screen.getAllByText("Обов'язкове")).toHaveLength(1);
  });

  it("does not save a calculation without a formula, and says why", async () => {
    const user = userEvent.setup();

    renderBuilder();
    await addCalculation(user);
    await user.type(screen.getAllByLabelText("Текст питання").at(-1)!, "Разом");
    await save(user);

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(await screen.findByText("Напишіть формулу")).toBeInTheDocument();
  });

  it("does not save a formula with a mistake", async () => {
    const user = userEvent.setup();

    renderBuilder();
    await addCalculation(user);
    await user.type(screen.getAllByLabelText("Текст питання").at(-1)!, "Разом");
    fireEvent.change(screen.getByLabelText("Формула"), { target: { value: "[[Місць]] + " } });
    await save(user);

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").some((a) => a.textContent?.includes("обривається"))).toBe(
      true,
    );
  });

  it("sends the formula with question ids, not names", async () => {
    const user = userEvent.setup();

    renderBuilder();
    await addCalculation(user);
    await user.type(screen.getAllByLabelText("Текст питання").at(-1)!, "Разом");
    fireEvent.change(screen.getByLabelText("Формула"), { target: { value: "[[Місць]] * 12.5" } });
    await user.type(screen.getByLabelText("Перед значенням"), "$");
    await save(user);

    expect(mockedUpdate).toHaveBeenCalledTimes(1);

    const calculation = mockedUpdate.mock.calls[0]![1].questions.find(
      (q) => q.type === "CALCULATION",
    );

    expect(calculation).toMatchObject({
      text: "Разом",
      required: false,
      config: {
        formula: "{q:q-seats} * 12.5",
        resultType: "number",
        decimals: 2,
        prefix: "$",
        display: "visible",
        emptyAsZero: true,
      },
    });
  });

  it("loads a saved calculation with the names of the questions", async () => {
    mockedGet.mockResolvedValue(
      adminForm({
        questions: [
          seats,
          {
            id: "q-total",
            text: "Разом",
            type: "CALCULATION",
            required: false,
            order: 1,
            options: [],
            config: { formula: "{q:q-seats} * 2", resultType: "number", decimals: 2 },
          },
        ],
      }),
    );
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    expect(screen.getByLabelText("Формула")).toHaveValue("[[Місць]] * 2");
  });

  it("a result rule can look at a calculation field, a question's own condition cannot", async () => {
    mockedGet.mockResolvedValue(
      adminForm({
        questions: [
          seats,
          {
            id: "q-total",
            text: "Разом",
            type: "CALCULATION",
            required: false,
            order: 1,
            options: [],
            config: { formula: "{q:q-seats} * 2", resultType: "number", decimals: 2 },
          },
          { ...seats, id: "q-note", text: "Після", type: "TEXT", order: 2 },
        ],
      }),
    );
    const user = userEvent.setup();

    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    // The condition of the question after the calculation offers the number, not the calculation.
    const toggles = screen.getAllByRole("checkbox", { name: /Показувати лише за умовою/ });

    await user.click(toggles.at(-1)!);

    const own = screen
      .getAllByRole("combobox")
      .find((c) =>
        Array.from((c as HTMLSelectElement).options).some((o) => o.textContent === "#1 Місць"),
      ) as HTMLSelectElement;

    expect(Array.from(own.options).map((o) => o.textContent)).not.toContain("#2 Разом");

    await user.click(screen.getByRole("button", { name: "Додати правило" }));

    const rule = screen.getByRole("group", { name: "Правило 1" });
    const targets = within(rule).getAllByRole("combobox")[0] as HTMLSelectElement;

    expect(Array.from(targets.options).map((o) => o.textContent)).toContain("#2 Разом");

    // Picking the calculation gives number operators and a number field.
    await user.selectOptions(targets, "q-total");
    expect(rule.querySelector("input[type=number]")).not.toBeNull();
  });
});
