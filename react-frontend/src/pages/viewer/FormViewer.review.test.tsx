import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormViewer from "./FormViewer";
import type { Question } from "../../types/formBuilder";

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

const questions = [
  q({ id: "name", order: 0, text: "Ваше імʼя", required: true }),
  q({
    id: "color",
    order: 1,
    text: "Колір",
    type: "CHOICE_SINGLE",
    options: [
      { id: "red", text: "Червоний", isDefault: false },
      { id: "blue", text: "Синій", isDefault: false },
    ],
  }),
];

const setup = () => {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(<FormViewer formTitle="Тест" questions={questions} onSubmit={onSubmit} />);

  return { user, onSubmit };
};

const REVIEW = { name: "Переглянути відповіді" };

describe("FormViewer - перегляд введених відповідей", () => {
  it("«Переглянути відповіді» показує відповіді текстом, а не id", async () => {
    const { user } = setup();

    await user.type(screen.getByLabelText(/Ваше імʼя/), "Олена");
    await user.click(screen.getByLabelText("Синій"));
    await user.click(screen.getByRole("button", REVIEW));

    expect(screen.getByRole("heading", { name: "Перегляньте свої відповіді" })).toBeInTheDocument();
    expect(screen.getByText("Олена")).toBeInTheDocument();
    expect(screen.getByText("Синій")).toBeInTheDocument();
    expect(screen.queryByText("blue")).not.toBeInTheDocument();
  });

  it("позначає обовʼязкове питання без відповіді", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", REVIEW));

    expect(screen.getByText(/Обовʼязкове питання/)).toBeInTheDocument();
    expect(screen.getByText("Без відповіді")).toBeInTheDocument();
  });

  it("«Змінити» повертає до форми зі збереженими відповідями", async () => {
    const { user } = setup();

    await user.type(screen.getByLabelText(/Ваше імʼя/), "Олена");
    await user.click(screen.getByRole("button", REVIEW));

    const row = screen.getByText("Олена").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Змінити" }));

    expect(screen.getByLabelText(/Ваше імʼя/)).toHaveValue("Олена");
  });

  it("«Назад до питань» повертає до форми", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", REVIEW));
    await user.click(screen.getByRole("button", { name: /Назад до питань/ }));

    expect(screen.getByLabelText(/Ваше імʼя/)).toBeInTheDocument();
  });

  it("надсилання з перегляду з порожнім обовʼязковим полем повертає до форми з помилкою", async () => {
    const { user, onSubmit } = setup();

    await user.click(screen.getByRole("button", REVIEW));
    await user.click(screen.getByRole("button", { name: "Надіслати відповіді" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Ваше імʼя/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("надсилає відповіді з екрана перегляду", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/Ваше імʼя/), "Олена");
    await user.click(screen.getByRole("button", REVIEW));
    await user.click(screen.getByRole("button", { name: "Надіслати відповіді" }));

    expect(onSubmit).toHaveBeenCalledWith({ name: "Олена" });
  });

  it("показує, скільки питань уже заповнено", async () => {
    const { user } = setup();

    expect(screen.getAllByText("Відповіді: 0 із 2").length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText(/Ваше імʼя/), "О");

    expect(screen.getAllByText("Відповіді: 1 із 2").length).toBeGreaterThan(0);
  });
});
