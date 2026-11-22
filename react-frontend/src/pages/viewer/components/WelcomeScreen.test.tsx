import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeScreen from "./WelcomeScreen";
import { estimateMinutes } from "./welcomeFacts";

const screenData = { title: "Вітаємо", text: "Коротке опитування", buttonLabel: "" };

describe("estimateMinutes", () => {
  it("близько чверті хвилини на питання, не менше хвилини", () => {
    expect(estimateMinutes(8)).toBe(2);
    expect(estimateMinutes(1)).toBe(1);
    expect(estimateMinutes(0)).toBe(1);
    expect(estimateMinutes(40)).toBe(10);
  });
});

describe("WelcomeScreen", () => {
  it("показує заголовок, опис і кнопку з власним написом автора", async () => {
    const onStart = vi.fn();
    render(<WelcomeScreen screen={{ ...screenData, buttonLabel: "Поїхали" }} onStart={onStart} />);

    expect(screen.getByRole("heading", { level: 1, name: "Вітаємо" })).toBeInTheDocument();
    expect(screen.getByText("Коротке опитування")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: /Поїхали/ }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("без власного напису кнопки - стандартний", () => {
    render(<WelcomeScreen screen={screenData} onStart={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Почати/ })).toBeInTheDocument();
  });

  it("факти про форму: кількість питань, орієнтовний час, мова", () => {
    render(
      <WelcomeScreen
        screen={screenData}
        onStart={vi.fn()}
        questionCount={8}
        languageName="Українська"
        isMultilingual
      />,
    );

    expect(screen.getByText("8 питань")).toBeInTheDocument();
    expect(screen.getByText("Близько 2 хвилин")).toBeInTheDocument();
    expect(screen.getByText("Українська")).toBeInTheDocument();
    expect(screen.getByText("Мову можна змінити будь-коли")).toBeInTheDocument();
  });

  it("без кількості питань блок фактів не показується", () => {
    render(<WelcomeScreen screen={screenData} onStart={vi.fn()} />);

    expect(screen.queryByText(/Близько/)).not.toBeInTheDocument();
  });

  it("примітки залежать від режиму: покроково / усе на одній сторінці", () => {
    const { rerender } = render(
      <WelcomeScreen screen={screenData} onStart={vi.fn()} responseMode="STEP_BY_STEP" />,
    );
    expect(screen.getByText(/Одне питання за раз/)).toBeInTheDocument();

    rerender(<WelcomeScreen screen={screenData} onStart={vi.fn()} responseMode="ALL_AT_ONCE" />);
    expect(screen.queryByText(/Одне питання за раз/)).not.toBeInTheDocument();
    expect(screen.getByText(/на одній сторінці/)).toBeInTheDocument();
  });

  it("про гілки кажемо лише якщо в формі є умови", () => {
    const { rerender } = render(
      <WelcomeScreen screen={screenData} onStart={vi.fn()} hasBranching={false} />,
    );
    expect(screen.queryByText(/стосуються ваших відповідей/)).not.toBeInTheDocument();

    rerender(<WelcomeScreen screen={screenData} onStart={vi.fn()} hasBranching />);
    expect(screen.getByText(/стосуються ваших відповідей/)).toBeInTheDocument();
  });

  it("назва форми як надзаголовок лише коли відрізняється від заголовка екрана", () => {
    const { rerender } = render(
      <WelcomeScreen screen={screenData} onStart={vi.fn()} formTitle="Вітаємо" />,
    );
    expect(screen.getAllByText("Вітаємо")).toHaveLength(1);

    rerender(<WelcomeScreen screen={screenData} onStart={vi.fn()} formTitle="Планувальник" />);
    expect(screen.getByText("Планувальник")).toBeInTheDocument();
  });
});
