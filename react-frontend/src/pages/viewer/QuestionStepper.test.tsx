import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QuestionStepper from "./QuestionStepper";
import type { Question } from "../../types/formBuilder";
import { saveFormAttempt } from "../../api/publicFormApi";

vi.mock("../../api/publicFormApi", () => ({
  saveFormAttempt: vi.fn(),
}));

const mockedSave = vi.mocked(saveFormAttempt);

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

describe("QuestionStepper - покрокова навігація з умовним branching", () => {
  it("показує лише перше питання спочатку, з коректним лічильником кроку", () => {
    const questions = [
      q({ id: "q1", order: 0, text: "Перше питання" }),
      q({ id: "q2", order: 1, text: "Друге питання" }),
    ];
    render(<QuestionStepper formTitle="Тест" questions={questions} onSubmit={vi.fn()} />);

    expect(screen.getByText("Перше питання")).toBeInTheDocument();
    expect(screen.queryByText("Друге питання")).not.toBeInTheDocument();
    expect(screen.getByText("Питання 1")).toBeInTheDocument();
  });

  it("не пускає далі без заповнення required-поля поточного кроку", async () => {
    const user = userEvent.setup();
    const questions = [q({ id: "q1", order: 0, text: "Обов'язкове", required: true })];
    render(<QuestionStepper formTitle="Тест" questions={questions} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Далі →" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("обов'язков");
    expect(screen.getByText("Обов'язкове")).toBeInTheDocument(); // все ще на першому кроці
  });

  it("пропускає приховане умовою питання при переході Далі", async () => {
    const user = userEvent.setup();
    const questions = [
      q({
        id: "q1",
        order: 0,
        text: "Тригер",
        type: "CHOICE_SINGLE",
        options: [
          { id: "yes", text: "Так", isDefault: false },
          { id: "no", text: "Ні", isDefault: false },
        ],
      }),
      q({
        id: "q2",
        order: 1,
        text: "Приховане питання",
        condition: {
          logic: "AND",
          rules: [{ questionId: "q1", operator: "equals", value: "yes" }],
        },
      }),
      q({ id: "q3", order: 2, text: "Третє питання" }),
    ];
    render(<QuestionStepper formTitle="Тест" questions={questions} onSubmit={vi.fn()} />);

    await user.click(screen.getByLabelText("Ні"));
    await user.click(screen.getByRole("button", { name: "Далі →" }));

    // Одразу перейшли на q3, минаючи приховане q2
    expect(screen.getByText("Третє питання")).toBeInTheDocument();
    expect(screen.queryByText("Приховане питання")).not.toBeInTheDocument();
  });

  it("Назад повертає на попередній крок", async () => {
    const user = userEvent.setup();
    const questions = [
      q({ id: "q1", order: 0, text: "Перше" }),
      q({ id: "q2", order: 1, text: "Друге" }),
    ];
    render(<QuestionStepper formTitle="Тест" questions={questions} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Далі →" }));
    expect(screen.getByText("Друге")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← Назад" }));
    expect(screen.getByText("Перше")).toBeInTheDocument();
  });

  it("динамічно перераховує гілку при зміні відповіді після повернення назад", async () => {
    const user = userEvent.setup();
    const questions = [
      q({
        id: "q1",
        order: 0,
        text: "Тригер",
        type: "CHOICE_SINGLE",
        options: [
          { id: "yes", text: "Так", isDefault: false },
          { id: "no", text: "Ні", isDefault: false },
        ],
      }),
      q({
        id: "q2",
        order: 1,
        text: "Умовне питання",
        condition: {
          logic: "AND",
          rules: [{ questionId: "q1", operator: "equals", value: "yes" }],
        },
      }),
    ];
    render(<QuestionStepper formTitle="Тест" questions={questions} onSubmit={vi.fn()} />);

    // Спершу "Так" -> умовне питання з'являється, доходимо до review
    await user.click(screen.getByLabelText("Так"));
    await user.click(screen.getByRole("button", { name: "Далі →" }));
    expect(screen.getByText("Умовне питання")).toBeInTheDocument();

    // Повертаємось і міняємо на "Ні"
    await user.click(screen.getByRole("button", { name: "← Назад" }));
    await user.click(screen.getByLabelText("Ні"));
    await user.click(screen.getByRole("button", { name: "Далі →" }));

    // Тепер має бути review-екран одразу, без "Умовне питання" в path
    expect(screen.getByText("Готово, перевірте відповіді")).toBeInTheDocument();
    expect(screen.queryByText("Умовне питання")).not.toBeInTheDocument();
  });

  it("доходить до review-екрана і сабмітить очищені відповіді", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const questions = [q({ id: "q1", order: 0, text: "Ім'я" })];
    render(<QuestionStepper formTitle="Тест" questions={questions} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/Ім'я/), "Олександр");
    await user.click(screen.getByRole("button", { name: "Далі →" }));

    expect(screen.getByText("Готово, перевірте відповіді")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Надіслати відповіді" }));

    expect(onSubmit).toHaveBeenCalledWith({ q1: "Олександр" });
  });
});

describe("QuestionStepper - autosave передає reachedQuestionIds (реально показані питання)", () => {
  const linear = [
    q({ id: "q1", order: 0, text: "Перше" }),
    q({ id: "q2", order: 1, text: "Друге" }),
    q({ id: "q3", order: 2, text: "Третє" }),
  ];

  const flush = () => act(() => vi.advanceTimersByTimeAsync(1300));
  const lastReached = () => mockedSave.mock.calls.at(-1)?.[3];

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedSave.mockReset();
    mockedSave.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <QuestionStepper
        formTitle="Тест"
        questions={linear}
        onSubmit={vi.fn()}
        shareId="share-1"
        sessionKey="session-1"
      />,
    );
    return user;
  };

  it("на першому кроці лінійної форми досягнуто лише перше питання, а не всі три", async () => {
    setup();
    await flush();

    expect(lastReached()).toEqual(["q1"]);
  });

  it("перехід на наступний крок БЕЗ зміни відповіді теж зберігається (пропуск необов'язкового)", async () => {
    const user = setup();
    await flush();

    await user.click(screen.getByRole("button", { name: "Далі →" }));
    await flush();

    expect(lastReached()).toEqual(["q1", "q2"]);
  });

  it("на review-екрані досягнуто весь пройдений шлях", async () => {
    const user = setup();
    // Кожен крок чекаємо окремо: під час переходу екран, що виходить, inert
    // і кліки по ньому ігноруються (див. StepTransition).
    for (const next of ["Друге", "Третє"]) {
      await user.click(await screen.findByRole("button", { name: "Далі →" }));
      await screen.findByText(next);
    }
    await user.click(await screen.findByRole("button", { name: "Далі →" }));
    await flush();

    expect(screen.getByText("Готово, перевірте відповіді")).toBeInTheDocument();
    expect(lastReached()).toEqual(["q1", "q2", "q3"]);
  });
});

describe("QuestionStepper - анімований перехід між кроками (фокус, повторні кліки)", () => {
  const steps = [
    q({ id: "q1", order: 0, text: "Перше" }),
    q({ id: "q2", order: 1, text: "Друге" }),
    q({ id: "q3", order: 2, text: "Третє" }),
  ];
  const next = () => screen.findByRole("button", { name: "Далі →" });
  const headingOf = (text: string) => screen.getByText(text).closest("[tabindex='-1']");

  const setup = () => {
    render(<QuestionStepper formTitle="Тест" questions={steps} onSubmit={vi.fn()} />);
    return userEvent.setup();
  };

  it("після «Далі» фокус переходить на заголовок НОВОГО питання (а не лишається на екрані, що виходить)", async () => {
    const user = setup();

    await user.click(await next());
    await screen.findByText("Друге");

    await waitFor(() => expect(headingOf("Друге")).toHaveFocus());
  });

  it("після «Назад» фокус переходить на заголовок попереднього питання", async () => {
    const user = setup();
    await user.click(await next());
    await screen.findByText("Друге");

    await user.click(await screen.findByRole("button", { name: "← Назад" }));
    await screen.findByText("Перше");

    await waitFor(() => expect(headingOf("Перше")).toHaveFocus());
  });

  it("фокус НЕ краде з поля введення під час набору тексту (re-render не повертає фокус на заголовок)", async () => {
    const user = setup();
    const input = await screen.findByRole("textbox");

    await user.click(input);
    await user.type(input, "привіт");

    expect(input).toHaveFocus();
    expect(input).toHaveValue("привіт");
  });

  it("повторний клік по кнопці екрана, що вже виходить, не перескакує крок", async () => {
    const user = setup();
    const staleNext = await next();

    fireEvent.click(staleNext);
    fireEvent.click(staleNext); // друге натискання на "старій" кнопці

    await screen.findByText("Друге");
    expect(screen.queryByText("Третє")).not.toBeInTheDocument();
    expect(screen.getByText("Питання 2")).toBeInTheDocument();
    await user.click(await next()); // а наступний справжній клік іде далі як звичайно
    expect(await screen.findByText("Третє")).toBeInTheDocument();
  });

  it("«Змінити відповідь» на review повертає на потрібне питання", async () => {
    const user = setup();
    for (const label of ["Друге", "Третє"]) {
      await user.click(await next());
      await screen.findByText(label);
    }
    await user.click(await next());
    await screen.findByText("Готово, перевірте відповіді");

    const changeButtons = await screen.findAllByRole("button", { name: "Змінити" });
    await user.click(changeButtons[0]);

    expect(await screen.findByText("Перше")).toBeInTheDocument();
    expect(screen.getByText("Питання 1")).toBeInTheDocument();
  });
});
