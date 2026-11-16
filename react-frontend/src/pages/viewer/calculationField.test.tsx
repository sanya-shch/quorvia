import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormViewer from "./FormViewer";
import QuestionStepper from "./QuestionStepper";
import type { Question } from "../../types/formBuilder";

vi.mock("../../api/publicFormApi", () => ({ saveFormAttempt: vi.fn() }));

const q = (overrides: Partial<Question>): Question => ({
  id: "q",
  type: "TEXT",
  text: "",
  required: false,
  order: 0,
  options: [],
  config: null,
  ...overrides,
});

const count = q({ id: "n", order: 0, type: "NUMBER", text: "Кількість" });
const size = q({
  id: "size",
  order: 1,
  type: "CHOICE_SINGLE",
  text: "Розмір",
  // The viewer gets the points of a question a visible formula reads: here, the price.
  options: [
    { id: "s", text: "Малий", isDefault: false, score: 10 },
    { id: "l", text: "Великий", isDefault: false, score: 25.5 },
  ],
});

const calculation = (id: string, order: number, formula: string, config = {}): Question =>
  q({
    id,
    order,
    type: "CALCULATION",
    text: "Разом",
    config: { formula, resultType: "number", decimals: 2, ...config },
  });

const total = calculation("total", 2, "{q:n} * {q:size}", { prefix: "$" });

describe("FormViewer - calculation field", () => {
  it("shows the value and updates it while the respondent answers", async () => {
    const user = userEvent.setup();

    render(<FormViewer formTitle="Тест" questions={[count, size, total]} onSubmit={vi.fn()} />);

    // Nothing answered: empty answers count as 0.
    expect(screen.getByRole("status")).toHaveTextContent("$0,00");

    await user.type(screen.getByLabelText("Кількість"), "3");
    await user.click(screen.getByLabelText("Великий"));

    // 3 * 25.5
    expect(screen.getByRole("status")).toHaveTextContent("$76,50");

    await user.click(screen.getByLabelText("Малий"));

    expect(screen.getByRole("status")).toHaveTextContent("$30,00");
  });

  it("is labelled by the question, and is not an input", () => {
    render(<FormViewer formTitle="Тест" questions={[count, size, total]} onSubmit={vi.fn()} />);

    const field = screen.getByLabelText("Разом");

    expect(field.tagName).toBe("OUTPUT");
    expect(screen.queryByRole("spinbutton", { name: "Разом" })).not.toBeInTheDocument();
  });

  it("shows a dash while a question it needs is unanswered and 'empty counts as 0' is off", async () => {
    const user = userEvent.setup();
    const strict = calculation("strict", 1, "{q:n} * 2", { emptyAsZero: false });

    render(<FormViewer formTitle="Тест" questions={[count, strict]} onSubmit={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("—");

    await user.type(screen.getByLabelText("Кількість"), "4");

    expect(screen.getByRole("status")).toHaveTextContent("8,00");
  });

  it("shows text and yes/no results", () => {
    const label = calculation("label", 2, 'IF({q:n} > 2, "багато", "мало")', {
      resultType: "string",
    });
    const flag = calculation("flag", 3, "{q:n} > 2", { resultType: "boolean" });

    render(
      <FormViewer formTitle="Тест" questions={[count, size, label, flag]} onSubmit={vi.fn()} />,
    );

    const [text, yesNo] = screen.getAllByRole("status");

    expect(text).toHaveTextContent("мало");
    expect(yesNo).toHaveTextContent("Ні");

    fireEvent.change(screen.getByLabelText("Кількість"), { target: { value: "5" } });

    expect(text).toHaveTextContent("багато");
    expect(yesNo).toHaveTextContent("Так");
  });

  it("does not show a calculation hidden from the respondent", () => {
    const hidden = calculation("secret", 2, "{q:n}", { display: "hidden" });

    render(<FormViewer formTitle="Тест" questions={[count, size, hidden]} onSubmit={vi.fn()} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Разом")).not.toBeInTheDocument();
  });

  it("does not send the computed value, and never blocks the submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Тест" questions={[count, size, total]} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Кількість"), "2");
    await user.click(screen.getByLabelText("Малий"));
    await user.click(screen.getByRole("button", { name: "Надіслати відповіді" }));

    expect(onSubmit).toHaveBeenCalledWith({ n: 2, size: "s" });
  });

  it("a question hidden by a condition counts as empty in the formula", async () => {
    const user = userEvent.setup();
    const gate = q({
      id: "gate",
      order: 0,
      type: "BOOLEAN",
      text: "Є знижка?",
    });
    const discount = q({
      id: "disc",
      order: 1,
      type: "NUMBER",
      text: "Знижка",
      condition: { logic: "AND", rules: [{ questionId: "gate", operator: "equals", value: true }] },
    });
    const final = calculation("final", 2, "100 - {q:disc}");

    render(<FormViewer formTitle="Тест" questions={[gate, discount, final]} onSubmit={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("100,00");

    await user.click(screen.getByRole("switch"));
    await user.type(screen.getByLabelText("Знижка"), "15");

    expect(screen.getByRole("status")).toHaveTextContent("85,00");

    // The switch goes off: the discount question disappears and its old answer stops counting.
    await user.click(screen.getByRole("switch"));

    expect(screen.getByRole("status")).toHaveTextContent("100,00");
  });
});

describe("QuestionStepper - calculation field", () => {
  const go = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "Далі →" }));

  it("is a step of its own that shows the value, and the review shows it too", async () => {
    const user = userEvent.setup();

    render(
      <QuestionStepper formTitle="Тест" questions={[count, size, total]} onSubmit={vi.fn()} />,
    );

    await user.type(screen.getByLabelText("Кількість"), "4");
    await go(user);
    await user.click(screen.getByLabelText("Великий"));
    await go(user);

    // 4 * 25.5
    expect(screen.getByRole("status")).toHaveTextContent("$102,00");

    await go(user);

    expect(screen.getByText(/Разом - \$102,00/)).toBeInTheDocument();
  });

  it("does not send the computed value", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <QuestionStepper formTitle="Тест" questions={[count, size, total]} onSubmit={onSubmit} />,
    );
    await user.type(screen.getByLabelText("Кількість"), "4");
    await go(user);
    await user.click(screen.getByLabelText("Великий"));
    await go(user);
    await go(user);
    await user.click(screen.getByRole("button", { name: "Надіслати відповіді" }));

    expect(onSubmit).toHaveBeenCalledWith({ n: 4, size: "l" });
  });

  it("does not make a step of a calculation hidden from the respondent", async () => {
    const user = userEvent.setup();
    const hidden = calculation("secret", 1, "{q:n}", { display: "hidden" });

    render(<QuestionStepper formTitle="Тест" questions={[count, hidden]} onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText("Кількість"), "4");
    await go(user);

    // Straight to the review: there is no second step.
    expect(screen.getByText("Готово, перевірте відповіді")).toBeInTheDocument();
  });
});
