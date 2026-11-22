import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWorkspace } from "../workspace/renderWorkspace";
import { formsApi } from "../../api/forms";
import type { AdminForm } from "../../types/formBuilder";

vi.mock("../../api/forms", () => ({
  formsApi: {
    getAdminForm: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    duplicate: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../viewer/theme/fonts", () => ({
  useThemeFont: () => undefined,
  loadFont: () => Promise.resolve(),
}));

vi.mock("../../api/quotasApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/quotasApi")>()),
  quotasApi: { list: vi.fn().mockResolvedValue([]) },
}));

// The workspace sections are lazy chunks: the first render in jsdom is slow.
vi.setConfig({ testTimeout: 20000 });

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

const renderBuilder = () => renderWorkspace("/forms/form-1/builder");

const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole("button", { name: "Зберегти" }));

// Adds a calculation field after the first question through the "+" menu.
const addCalculation = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByRole("button", { name: "Додати питання" }, { timeout: 5000 });
  await user.click(screen.getByRole("button", { name: "Додати питання" }));
  await user.click(screen.getByRole("button", { name: /Обчислюване поле/ }));
};

describe("Form workspace - calculation fields", () => {
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
    // A calculation is computed, never required: its settings have no "required" switch.
    expect(screen.queryByText("Обов'язкова відповідь")).not.toBeInTheDocument();
  });

  it("does not save a calculation without a formula, and says why", async () => {
    const user = userEvent.setup();

    renderBuilder();
    await addCalculation(user);
    await user.type(screen.getByLabelText("Назва питання"), "Разом");
    await save(user);

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(await screen.findByText("Напишіть формулу")).toBeInTheDocument();
  });

  it("does not save a formula with a mistake", async () => {
    const user = userEvent.setup();

    renderBuilder();
    await addCalculation(user);
    await user.type(screen.getByLabelText("Назва питання"), "Разом");
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
    await user.type(screen.getByLabelText("Назва питання"), "Разом");
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
    const user = userEvent.setup();
    renderBuilder();
    await screen.findByRole("button", { name: "Додати питання" }, { timeout: 5000 });
    await user.click(screen.getByRole("button", { name: /Разом/ }));

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
    await screen.findByRole("button", { name: "Додати питання" }, { timeout: 5000 });

    // The condition of the question after the calculation offers the number, not the calculation.
    await user.click(screen.getByRole("button", { name: /Після/ }));
    await user.click(screen.getByRole("checkbox", { name: /Показувати лише за умовою/ }));

    const own = screen
      .getAllByRole("combobox")
      .find((c) =>
        Array.from((c as HTMLSelectElement).options).some((o) => o.textContent === "#1 Місць"),
      ) as HTMLSelectElement;

    expect(Array.from(own.options).map((o) => o.textContent)).not.toContain("#2 Разом");

    // The result rules are a form setting: they live in Settings (same draft, nothing is lost).
    await user.click(screen.getByRole("link", { name: /Огляд/ }));
    await user.click(await screen.findByRole("link", { name: "Налаштування" }));
    await user.click(await screen.findByRole("button", { name: "Додати правило" }));

    const rule = screen.getByRole("group", { name: "Правило 1" });
    const targets = within(rule).getAllByRole("combobox")[0] as HTMLSelectElement;

    expect(Array.from(targets.options).map((o) => o.textContent)).toContain("#2 Разом");

    // Picking the calculation gives number operators and a number field.
    await user.selectOptions(targets, "q-total");
    expect(rule.querySelector("input[type=number]")).not.toBeNull();
  });
});
