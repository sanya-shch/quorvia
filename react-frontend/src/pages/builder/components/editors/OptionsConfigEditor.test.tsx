import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DragDropContext } from "@hello-pangea/dnd";
import OptionsConfigEditor from "./OptionsConfigEditor";
import type { QuestionOption } from "../../../../types/formBuilder";

const initial: QuestionOption[] = [
  { id: "a", text: "Кава", isDefault: false },
  { id: "b", text: "Чай", isDefault: false },
];

function Harness({ start = initial, spy }: { start?: QuestionOption[]; spy?: (o: QuestionOption[]) => void }) {
  const [options, setOptions] = useState(start);

  return (
    <DragDropContext onDragEnd={vi.fn()}>
      <OptionsConfigEditor
        questionIndex={0}
        questionType="CHOICE_SINGLE"
        options={options}
        displayVariant="list"
        onChangeOptions={(next) => {
          setOptions(next);
          spy?.(next);
        }}
        onChangeDisplayVariant={vi.fn()}
      />
    </DragDropContext>
  );
}

describe("OptionsConfigEditor - варіант «Інше»", () => {
  it("додає «Інше» останнім з позначкою isOther, без можливості зробити його типовим", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness spy={spy} />);

    await user.click(screen.getByRole("button", { name: "Додати «Інше»" }));

    const next = spy.mock.calls.at(-1)![0] as QuestionOption[];
    expect(next.map((o) => o.id).slice(0, 2)).toEqual(["a", "b"]);
    expect(next[2]).toMatchObject({ text: "Інше", isOther: true, isDefault: false });
    expect(screen.getByLabelText("Текст варіанта «Інше»")).toHaveValue("Інше");
  });

  it("кнопка додавання зникає, коли «Інше» вже є (не більше одного)", async () => {
    const user = userEvent.setup();

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Додати «Інше»" }));

    expect(screen.queryByRole("button", { name: "Додати «Інше»" })).not.toBeInTheDocument();
  });

  it("новий звичайний варіант вставляється перед «Інше», а не після", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness spy={spy} />);
    await user.click(screen.getByRole("button", { name: "Додати «Інше»" }));
    await user.click(screen.getByRole("button", { name: "Додати варіант" }));

    const next = spy.mock.calls.at(-1)![0] as QuestionOption[];
    expect(next).toHaveLength(4);
    expect(next[3].isOther).toBe(true);
    expect(next[2].isOther).toBeUndefined();
  });

  it("видалення «Інше» повертає список до звичайних варіантів", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness spy={spy} />);
    await user.click(screen.getByRole("button", { name: "Додати «Інше»" }));
    await user.click(screen.getByRole("button", { name: "Видалити варіант «Інше»" }));

    expect((spy.mock.calls.at(-1)![0] as QuestionOption[]).map((o) => o.id)).toEqual(["a", "b"]);
    expect(screen.getByRole("button", { name: "Додати «Інше»" })).toBeInTheDocument();
  });

  it("не дозволяє видалити останній звичайний варіант навіть при наявному «Інше»", () => {
    render(
      <Harness
        start={[
          { id: "a", text: "Кава", isDefault: false },
          { id: "o", text: "Інше", isDefault: false, isOther: true },
        ]}
      />,
    );

    const removeButtons = screen
      .getAllByRole("button")
      .filter((b) => b.className.includes("hover:text-rose-600") && !b.getAttribute("aria-label"));

    // єдина кнопка видалення звичайного варіанта заблокована
    expect(removeButtons.length).toBeGreaterThan(0);
    expect(removeButtons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("текст «Інше» редагується", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(
      <Harness
        spy={spy}
        start={[
          { id: "a", text: "Кава", isDefault: false },
          { id: "o", text: "Інше", isDefault: false, isOther: true },
        ]}
      />,
    );

    const input = screen.getByLabelText("Текст варіанта «Інше»");
    await user.clear(input);
    await user.type(input, "Свій");

    const last = spy.mock.calls.at(-1)![0] as QuestionOption[];
    expect(last.find((o) => o.isOther)?.text).toBe("Свій");
  });
});

describe("OptionsConfigEditor - RANKING", () => {
  const rankingOptions: QuestionOption[] = [
    { id: "a", text: "Кава", isDefault: false },
    { id: "b", text: "Чай", isDefault: false },
  ];

  const renderRanking = (start: QuestionOption[] = rankingOptions, spy?: (o: QuestionOption[]) => void) => {
    function RankingHarness() {
      const [options, setOptions] = useState(start);

      return (
        <DragDropContext onDragEnd={vi.fn()}>
          <OptionsConfigEditor
            questionIndex={0}
            questionType="RANKING"
            options={options}
            displayVariant="list"
            onChangeOptions={(next) => {
              setOptions(next);
              spy?.(next);
            }}
            onChangeDisplayVariant={vi.fn()}
          />
        </DragDropContext>
      );
    }

    return render(<RankingHarness />);
  };

  it("не показує «Інше», стиль відображення і перемикач «за замовчуванням»", () => {
    renderRanking();

    expect(screen.queryByRole("button", { name: "Додати «Інше»" })).not.toBeInTheDocument();
    expect(screen.queryByText("Стиль відображення")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/за замовчуванням/i)).not.toBeInTheDocument();
    expect(screen.getByText(/2–20 варіантів/)).toBeInTheDocument();
  });

  it("не дозволяє опуститися нижче двох варіантів", () => {
    renderRanking();

    const removeButtons = screen
      .getAllByRole("button")
      .filter((b) => b.className.includes("hover:text-rose-600"));

    expect(removeButtons).toHaveLength(2);
    expect(removeButtons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("додає варіанти аж до 20, далі кнопка заблокована", async () => {
    const user = userEvent.setup();
    const start = Array.from({ length: 19 }, (_, i) => ({
      id: `o${i}`,
      text: `V${i}`,
      isDefault: false,
    }));

    renderRanking(start);

    const add = screen.getByRole("button", { name: "Додати варіант" });
    expect(add).toBeEnabled();

    await user.click(add);
    expect(screen.getByRole("button", { name: "Додати варіант" })).toBeDisabled();
  });
});
