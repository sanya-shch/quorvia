import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormViewer from "./FormViewer";
import type { Question } from "../../types/formBuilder";

const q = (overrides: Partial<Question>): Question => ({
  id: "q",
  type: "TEXT",
  text: "Питання",
  required: false,
  order: 0,
  options: [],
  config: null,
  ...overrides,
});

const SUBMIT = { name: "Надіслати відповіді" };

describe("FormViewer - RATING", () => {
  it("показує стільки зірок, скільки в config.max, і надсилає вибране число", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <FormViewer
        formTitle="Т"
        questions={[q({ id: "r", type: "RATING", config: { max: 7 } })]}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getAllByRole("radio")).toHaveLength(7);

    await user.click(screen.getByRole("radio", { name: "4 з 7" }));
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ r: 4 });
  });

  it("обов'язковий рейтинг без вибору не надсилається", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <FormViewer
        formTitle="Т"
        questions={[q({ id: "r", type: "RATING", required: true })]}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("необов'язкову відповідь можна скасувати", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q({ id: "r", type: "RATING" })]} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("radio", { name: "3 з 5" }));
    await user.click(screen.getByRole("button", { name: "Скасувати відповідь" }));

    expect(screen.queryByRole("button", { name: "Скасувати відповідь" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "3 з 5" })).not.toBeChecked();
  });
});

describe("FormViewer - SCALE", () => {
  it("шкала з нуля: 0 - валідна відповідь, підписи країв показуються", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <FormViewer
        formTitle="Т"
        questions={[
          q({
            id: "s",
            type: "SCALE",
            required: true,
            config: { min: 0, max: 4, minLabel: "Зовсім ні", maxLabel: "Цілком так" },
          }),
        ]}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByText("Зовсім ні")).toBeInTheDocument();
    expect(screen.getByText("Цілком так")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "0 з 4" }));
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ s: 0 });
  });
});

describe("FormViewer - NPS", () => {
  it("11 варіантів 0-10 з типовими підписами країв", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q({ id: "n", type: "NPS" })]} onSubmit={onSubmit} />);

    expect(screen.getAllByRole("radio")).toHaveLength(11);
    expect(screen.getByText("Зовсім малоймовірно")).toBeInTheDocument();
    expect(screen.getByText("Дуже ймовірно")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "10 з 10" }));
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ n: 10 });
  });

  it("умова за шкалою працює як за числом (gt)", async () => {
    const user = userEvent.setup();

    render(
      <FormViewer
        formTitle="Т"
        questions={[
          q({ id: "n", order: 0, type: "NPS", text: "Оцініть" }),
          q({
            id: "why",
            order: 1,
            text: "Що не сподобалось?",
            condition: {
              logic: "AND",
              rules: [{ questionId: "n", operator: "lt", value: 7 }],
            },
          }),
        ]}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByText("Що не сподобалось?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "3 з 10" }));
    expect(screen.getByText("Що не сподобалось?")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "9 з 10" }));
    expect(screen.queryByText("Що не сподобалось?")).not.toBeInTheDocument();
  });
});

describe("FormViewer - NUMBER як слайдер", () => {
  const slider = (extra: Partial<Question> = {}) =>
    q({
      id: "n",
      type: "NUMBER",
      config: { numberVariant: "slider", min: 0, max: 10, step: 2 },
      ...extra,
    });

  it("доторк до непочатого слайдера ставить відповідь (навіть рівно min)", async () => {
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[slider()]} onSubmit={onSubmit} />);

    const range = screen.getByRole("slider");
    expect(screen.getByText("Не вибрано")).toBeInTheDocument();

    fireEvent.pointerDown(range);
    expect(screen.queryByText("Не вибрано")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).toHaveBeenCalledWith({ n: 0 });
  });

  it("зміна значення віддає число, а не рядок", async () => {
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[slider()]} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("slider"), { target: { value: "6" } });
    await userEvent.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ n: 6 });
  });

  it("слайдер без повного діапазону показується як звичайне числове поле", () => {
    render(
      <FormViewer
        formTitle="Т"
        questions={[q({ id: "n", type: "NUMBER", config: { numberVariant: "slider", min: 0 } })]}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });
});
