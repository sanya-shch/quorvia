import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormViewer from "./FormViewer";
import type { Question } from "../../types/formBuilder";

const options = [
  { id: "a", text: "Кава", isDefault: false },
  { id: "b", text: "Чай", isDefault: false },
  { id: "c", text: "Какао", isDefault: false },
];

const q = (overrides: Partial<Question> = {}): Question => ({
  id: "q",
  type: "RANKING",
  text: "Ранжуйте напої",
  required: false,
  order: 0,
  options,
  config: null,
  ...overrides,
});

const SUBMIT = { name: "Надіслати відповіді" };
const itemTexts = () => screen.getAllByRole("listitem").map((li) => li.textContent?.replace(/[↑↓\d]/g, "").trim());

describe("FormViewer - RANKING", () => {
  it("показує варіанти у вихідному порядку", () => {
    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={vi.fn()} />);

    expect(itemTexts()).toEqual(["Кава", "Чай", "Какао"]);
  });

  it("не має відповіді, доки респондент не взаємодіяв (необов'язкове питання не надсилається)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it("обов'язкове питання без взаємодії блокує відправку", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q({ required: true })]} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("«Залишити цей порядок» фіксує вихідний порядок як відповідь", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q({ required: true })]} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Залишити цей порядок" }));
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ q: ["a", "b", "c"] });
  });

  it("кнопки вище/нижче змінюють порядок; відповідь - повна перестановка", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Перемістити «Какао» вище" }));
    expect(itemTexts()).toEqual(["Кава", "Какао", "Чай"]);

    await user.click(screen.getByRole("button", { name: "Перемістити «Какао» вище" }));
    expect(itemTexts()).toEqual(["Какао", "Кава", "Чай"]);

    await user.click(screen.getByRole("button", { name: "Перемістити «Кава» нижче" }));
    expect(itemTexts()).toEqual(["Какао", "Чай", "Кава"]);

    await user.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).toHaveBeenCalledWith({ q: ["c", "b", "a"] });
  });

  it("крайні кнопки заблоковані: перший не піднімається, останній не опускається", () => {
    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Перемістити «Кава» вище" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Перемістити «Какао» нижче" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Перемістити «Чай» вище" })).toBeEnabled();
  });

  it("фокус лишається на кнопці переміщеного елемента (клавіатурне керування)", async () => {
    const user = userEvent.setup();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Перемістити «Чай» нижче" }));

    // "Tea" became last: "down" is no longer available, focus moves to "up"
    expect(screen.getByRole("button", { name: "Перемістити «Чай» вище" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Перемістити «Чай» вище" }));
    expect(screen.getByRole("button", { name: "Перемістити «Чай» вище" })).toHaveFocus();
  });

  it("повідомляє скрінрідеру нову позицію", async () => {
    const user = userEvent.setup();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Перемістити «Чай» вище" }));

    expect(screen.getByText("«Чай» тепер на місці 1 з 3")).toBeInTheDocument();
  });

  it("необов'язкову відповідь можна скасувати - порядок повертається до вихідного", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Перемістити «Чай» вище" }));
    await user.click(screen.getByRole("button", { name: "Скасувати відповідь" }));

    expect(itemTexts()).toEqual(["Кава", "Чай", "Какао"]);

    await user.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).toHaveBeenCalledWith({});
  });
});
