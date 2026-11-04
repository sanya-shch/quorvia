import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormViewer from "./FormViewer";
import QuestionStepper from "./QuestionStepper";
import { buildCleanedAnswers, validateField } from "./questionValidation";
import type { Question } from "../../types/formBuilder";

vi.mock("../../api/publicFormApi", () => ({ saveFormAttempt: vi.fn() }));

const columns = [
  { id: "agree", text: "Згоден", isDefault: false },
  { id: "disagree", text: "Не згоден", isDefault: false },
];
const rows = [
  { id: "speed", text: "Швидкість" },
  { id: "price", text: "Ціна" },
];

const q = (overrides: Partial<Question> = {}): Question => ({
  id: "q",
  type: "MATRIX",
  text: "Оцініть сервіс",
  required: false,
  order: 0,
  options: columns,
  config: { rows },
  ...overrides,
});

const SUBMIT = { name: "Надіслати відповіді" };
const row = (name: string) => within(screen.getByRole("group", { name }));

describe("FormViewer - MATRIX", () => {
  it("кожен рядок - окрема група (legend) з радіокнопками-колонками", () => {
    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={vi.fn()} />);

    expect(row("Швидкість").getAllByRole("radio")).toHaveLength(2);
    expect(row("Ціна").getAllByRole("radio")).toHaveLength(2);
  });

  it("надсилає об'єкт { рядок: колонка }", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q({ required: true })]} onSubmit={onSubmit} />);

    await user.click(row("Швидкість").getByLabelText("Згоден"));
    await user.click(row("Ціна").getByLabelText("Не згоден"));
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ q: { speed: "agree", price: "disagree" } });
  });

  it("зміна вибору в рядку не чіпає інші рядки", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={onSubmit} />);

    await user.click(row("Швидкість").getByLabelText("Згоден"));
    await user.click(row("Ціна").getByLabelText("Згоден"));
    await user.click(row("Швидкість").getByLabelText("Не згоден"));
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ q: { speed: "disagree", price: "agree" } });
  });

  it("обов'язкова матриця не надсилається, доки не заповнені всі рядки", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q({ required: true })]} onSubmit={onSubmit} />);

    await user.click(row("Швидкість").getByLabelText("Згоден"));
    await user.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(row("Ціна").getByLabelText("Згоден"));
    await user.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("необов'язкова: частково заповнена відправляється, порожня - ні", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    const { unmount } = render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).toHaveBeenLastCalledWith({});
    unmount();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={onSubmit} />);
    await user.click(row("Ціна").getByLabelText("Згоден"));
    await user.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).toHaveBeenLastCalledWith({ q: { price: "agree" } });
  });

  it("«Скасувати відповіді» очищає всю матрицю", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={onSubmit} />);
    await user.click(row("Ціна").getByLabelText("Згоден"));
    await user.click(screen.getByRole("button", { name: "Скасувати відповіді" }));

    expect(row("Ціна").getByLabelText("Згоден")).not.toBeChecked();
    await user.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).toHaveBeenCalledWith({});
  });
});

describe("validateField / buildCleanedAnswers - MATRIX", () => {
  it("validateField: обов'язкова - усі рядки; необов'язкова - що завгодно", () => {
    expect(validateField(q({ required: true }), "")?.key).toBe("errors.VALIDATION_FIELD_REQUIRED");
    expect(validateField(q({ required: true }), { speed: "agree" })?.key).toBe(
      "errors.VALIDATION_FIELD_REQUIRED",
    );
    expect(validateField(q({ required: true }), { speed: "agree", price: "agree" })).toBeNull();
    expect(validateField(q({ required: false }), { speed: "agree" })).toBeNull();
    expect(validateField(q({ required: false }), {})).toBeNull();
  });

  it("buildCleanedAnswers: порожня необов'язкова матриця не потрапляє в запит", () => {
    expect(buildCleanedAnswers([q()], { q: {} })).toEqual({});
    expect(buildCleanedAnswers([q()], { q: { price: "agree" } })).toEqual({
      q: { price: "agree" },
    });
  });
});

describe("QuestionStepper - екран перевірки відповідей", () => {
  it("показує тексти варіантів і матрицю замість id та [object Object]", async () => {
    const user = userEvent.setup();
    const questions: Question[] = [
      q({
        id: "c",
        type: "CHOICE_SINGLE",
        text: "Напій",
        order: 0,
        options: [
          { id: "tea", text: "Чай", isDefault: false },
          { id: "o", text: "Інше", isDefault: false, isOther: true },
        ],
        config: null,
      }),
      q({ id: "m", order: 1, text: "Оцінки" }),
      q({ id: "b", type: "BOOLEAN", order: 2, text: "Повернетесь?", options: [], config: null }),
    ];

    render(<QuestionStepper formTitle="Т" questions={questions} onSubmit={vi.fn()} />);

    await user.click(screen.getByLabelText("Інше"));
    await user.type(screen.getByRole("textbox", { name: "Ваш власний варіант" }), "Какао");
    await user.click(screen.getByRole("button", { name: "Далі →" }));

    await user.click(row("Швидкість").getByLabelText("Згоден"));
    await user.click(screen.getByRole("button", { name: "Далі →" }));

    await user.click(screen.getByRole("button", { name: "Далі →" }));

    expect(screen.getByText(/Напій - Інше: Какао/)).toBeInTheDocument();
    expect(screen.getByText(/Оцінки - Швидкість: Згоден/)).toBeInTheDocument();
    expect(screen.queryByText(/object Object/)).not.toBeInTheDocument();
    expect(screen.getByText(/Повернетесь\? - Ні/)).toBeInTheDocument();
  });
});
