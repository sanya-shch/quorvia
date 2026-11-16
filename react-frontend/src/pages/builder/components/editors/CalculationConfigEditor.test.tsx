import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalculationConfigEditor from "./CalculationConfigEditor";
import type { Question, QuestionConfig } from "../../../../types/formBuilder";

const plan: Question = {
  id: "plan",
  type: "CHOICE_SINGLE",
  text: "Тариф",
  required: false,
  order: 0,
  options: [
    { id: "basic", text: "Базовий", isDefault: false, score: 1500 },
    { id: "pro", text: "Профі", isDefault: false, score: 2500.5 },
  ],
  config: null,
};
const seats: Question = {
  id: "seats",
  type: "NUMBER",
  text: "Місць",
  required: false,
  order: 1,
  options: [],
  config: null,
};
const when: Question = { ...seats, id: "when", type: "DATE", text: "Дата", order: 2 };

const calculation = (config: QuestionConfig): Question => ({
  id: "total",
  type: "CALCULATION",
  text: "Разом",
  required: false,
  order: 3,
  options: [],
  config,
});

const base: QuestionConfig = { formula: "", resultType: "number", decimals: 2 };

// Keeps the question in state like the builder does, and reports every config.
function Harness({
  initial,
  others = [plan, seats, when],
  spy,
  error,
}: {
  initial: QuestionConfig;
  others?: Question[];
  spy?: (config: QuestionConfig) => void;
  error?: string;
}) {
  const [question, setQuestion] = useState(calculation(initial));

  return (
    <CalculationConfigEditor
      question={question}
      allQuestions={[...others, question]}
      error={error}
      onChange={(config) => {
        setQuestion({ ...question, config });
        spy?.(config);
      }}
    />
  );
}

const formulaField = () => screen.getByLabelText("Формула") as HTMLTextAreaElement;

describe("CalculationConfigEditor", () => {
  it("shows the names of the questions, and stores their ids", () => {
    const spy = vi.fn();

    render(<Harness initial={{ ...base, formula: "{q:plan} * {q:seats}" }} spy={spy} />);

    expect(formulaField().value).toBe("[[Тариф]] * [[Місць]]");

    fireEvent.change(formulaField(), { target: { value: "[[Тариф]] * [[Місць]] + 1" } });

    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ formula: "{q:plan} * {q:seats} + 1" }),
    );
  });

  it("renaming a question changes what is shown, not what is stored", () => {
    const { rerender } = render(
      <CalculationConfigEditor
        question={calculation({ ...base, formula: "{q:seats} * 2" })}
        allQuestions={[seats, calculation({ ...base, formula: "{q:seats} * 2" })]}
        onChange={() => undefined}
      />,
    );

    expect(formulaField().value).toBe("[[Місць]] * 2");

    const renamed = { ...seats, text: "Користувачів" };
    const total = calculation({ ...base, formula: "{q:seats} * 2" });

    rerender(
      <CalculationConfigEditor
        question={total}
        allQuestions={[renamed, total]}
        onChange={() => undefined}
      />,
    );

    expect(formulaField().value).toBe("[[Користувачів]] * 2");
  });

  it("inserts the chosen question into the formula", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness initial={{ ...base, formula: "2 * " }} spy={spy} />);
    await user.selectOptions(screen.getByLabelText("Вставити питання"), "seats");

    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ formula: "2 * {q:seats}" }));
  });

  it("offers only the questions a formula can read", () => {
    render(<Harness initial={base} />);

    const options = Array.from(
      (screen.getByLabelText("Вставити питання") as HTMLSelectElement).options,
    ).map((o) => o.textContent);

    // The date cannot be used and the field itself is not offered.
    expect(options).toEqual(["Оберіть питання…", "Тариф", "Місць"]);
  });

  it("inserts a function with its brackets", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness initial={base} spy={spy} />);
    await user.click(screen.getByRole("button", { name: /ROUND\(number, places\)/ }));

    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ formula: "ROUND()" }));
  });

  it("shows a problem with its position and marks the place", () => {
    render(<Harness initial={{ ...base, formula: "{q:seats} + * 2" }} />);

    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("Тут це не підходить");
    // [[Місць]] + * 2: the star is the 13th character.
    expect(alert).toHaveTextContent("Позиція 13");
    expect(alert.querySelector("mark")).toHaveTextContent("*");
  });

  it("says nothing about an empty formula, but shows the problem found when saving", () => {
    const { rerender } = render(<Harness initial={base} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(<Harness initial={base} error="Напишіть формулу" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Напишіть формулу");
  });

  it("explains a reference to a question that is gone", () => {
    render(<Harness initial={{ ...base, formula: "{q:ghost} + 1" }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Такого питання немає");
  });

  it("changes the result type and hides the places for a text", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness initial={base} spy={spy} />);

    expect(screen.getByLabelText("Знаків після коми")).toHaveValue(2);

    await user.selectOptions(screen.getByLabelText("Результат"), "string");

    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ resultType: "string" }));
    expect(screen.queryByLabelText("Знаків після коми")).not.toBeInTheDocument();
  });

  it("keeps the places between 0 and 8", () => {
    const spy = vi.fn();

    render(<Harness initial={base} spy={spy} />);
    fireEvent.change(screen.getByLabelText("Знаків після коми"), { target: { value: "12" } });

    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ decimals: 8 }));

    fireEvent.change(screen.getByLabelText("Знаків після коми"), { target: { value: "0" } });

    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ decimals: 0 }));
  });

  it("sets the prefix, the suffix, the display and what an empty answer counts as", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness initial={base} spy={spy} />);
    await user.type(screen.getByLabelText("Перед значенням"), "$");
    await user.selectOptions(screen.getByLabelText("Показувати респонденту"), "hidden");
    await user.click(screen.getByRole("checkbox", { name: "Порожнє рахується як 0" }));

    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ prefix: "$", display: "hidden", emptyAsZero: false }),
    );
  });

  it("shows the placeholder for the text of an end screen", () => {
    render(<Harness initial={base} />);

    expect(screen.getByText("{{calc:total}}")).toBeInTheDocument();
  });
});

describe("the test panel", () => {
  const formula = { ...base, formula: "{q:plan} * {q:seats} * 1.075", prefix: "$" };

  it("asks for the questions the formula reads and shows the result", async () => {
    const user = userEvent.setup();

    render(<Harness initial={formula} />);

    // Nothing answered yet: every empty answer counts as 0.
    expect(screen.getByRole("status")).toHaveTextContent("$0.00");

    await user.selectOptions(screen.getByLabelText("Тариф", { selector: "select" }), "pro");
    await user.type(screen.getByLabelText("Місць", { selector: "input" }), "3");

    // 2500.5 * 3 * 1.075 = 8064.1125
    expect(screen.getByRole("status")).toHaveTextContent("$8,064.11");
  });

  it("does not ask for a question the formula does not read", () => {
    render(<Harness initial={formula} />);

    expect(screen.queryByLabelText("Дата")).not.toBeInTheDocument();
  });

  it("says why there is no value", async () => {
    const user = userEvent.setup();

    render(<Harness initial={{ ...base, formula: "{q:plan} / {q:seats}" }} />);
    await user.selectOptions(screen.getByLabelText("Тариф", { selector: "select" }), "pro");

    expect(screen.getByRole("status")).toHaveTextContent("Ділення на нуль");
  });

  it("is off while the formula has a problem", () => {
    render(<Harness initial={{ ...base, formula: "1 +" }} />);

    expect(screen.getByText("Виправте формулу, щоб її перевірити.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
