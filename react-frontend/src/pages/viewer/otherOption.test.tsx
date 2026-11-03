import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormViewer from "./FormViewer";
import { buildCleanedAnswers, validateField } from "./questionValidation";
import type { Question } from "../../types/formBuilder";

const options = [
  { id: "a", text: "Кава", isDefault: false },
  { id: "b", text: "Чай", isDefault: false },
  { id: "o", text: "Інше", isDefault: false, isOther: true },
];

const q = (overrides: Partial<Question>): Question => ({
  id: "q",
  type: "CHOICE_SINGLE",
  text: "Що п'єте?",
  required: false,
  order: 0,
  options,
  config: null,
  ...overrides,
});

const SUBMIT = { name: "Надіслати відповіді" };
const OTHER_INPUT = { name: "Ваш власний варіант" };

describe("FormViewer - варіант «Інше» (CHOICE_SINGLE)", () => {
  it("поле тексту з'являється лише коли обрано «Інше»", async () => {
    const user = userEvent.setup();

    render(<FormViewer formTitle="Т" questions={[q({})]} onSubmit={vi.fn()} />);

    expect(screen.queryByRole("textbox", OTHER_INPUT)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Інше"));
    expect(screen.getByRole("textbox", OTHER_INPUT)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Чай"));
    expect(screen.queryByRole("textbox", OTHER_INPUT)).not.toBeInTheDocument();
  });

  it("фокус переходить у поле, щойно з'явилось після вибору", async () => {
    const user = userEvent.setup();

    render(<FormViewer formTitle="Т" questions={[q({})]} onSubmit={vi.fn()} />);
    await user.click(screen.getByLabelText("Інше"));

    expect(screen.getByRole("textbox", OTHER_INPUT)).toHaveFocus();
  });

  it("обране «Інше» без тексту не надсилається, навіть якщо питання не обов'язкове", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q({ required: false })]} onSubmit={onSubmit} />);

    await user.click(screen.getByLabelText("Інше"));
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", OTHER_INPUT)).toHaveAttribute("aria-invalid", "true");
  });

  it("надсилає id варіанта разом із текстом (обрізаним від пробілів)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q({})]} onSubmit={onSubmit} />);

    await user.click(screen.getByLabelText("Інше"));
    await user.type(screen.getByRole("textbox", OTHER_INPUT), "  Какао ");
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ q: "o", q__other: "Какао" });
  });

  it("після зміни вибору старий текст «Інше» не надсилається", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q({})]} onSubmit={onSubmit} />);

    await user.click(screen.getByLabelText("Інше"));
    await user.type(screen.getByRole("textbox", OTHER_INPUT), "Какао");
    await user.click(screen.getByLabelText("Чай"));
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ q: "b" });
  });
});

describe("FormViewer - варіант «Інше» (CHOICE_MULTI)", () => {
  it("«Інше» разом зі звичайними варіантами: масив id + текст", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <FormViewer
        formTitle="Т"
        questions={[q({ type: "CHOICE_MULTI" })]}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByLabelText("Кава"));
    await user.click(screen.getByLabelText("Інше"));
    await user.type(screen.getByRole("textbox", OTHER_INPUT), "Матча");
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ q: ["a", "o"], q__other: "Матча" });
  });
});

describe("validateField / buildCleanedAnswers - «Інше»", () => {
  it("validateField: порожній текст при обраному «Інше» - помилка обов'язковості", () => {
    expect(validateField(q({}), "o", "")?.key).toBe("errors.VALIDATION_FIELD_REQUIRED");
    expect(validateField(q({}), "o", "   ")?.key).toBe("errors.VALIDATION_FIELD_REQUIRED");
    expect(validateField(q({}), "o", undefined)?.key).toBe("errors.VALIDATION_FIELD_REQUIRED");
    expect(validateField(q({}), "o", "текст")).toBeNull();
    expect(validateField(q({}), "a", "")).toBeNull();
  });

  it("buildCleanedAnswers: текст лише при обраному «Інше»", () => {
    const question = q({ id: "q" });

    expect(buildCleanedAnswers([question], { q: "o", q__other: " x " })).toEqual({
      q: "o",
      q__other: "x",
    });
    expect(buildCleanedAnswers([question], { q: "a", q__other: "старий" })).toEqual({ q: "a" });
    expect(buildCleanedAnswers([question], { q: "", q__other: "старий" })).toEqual({});
  });
});
