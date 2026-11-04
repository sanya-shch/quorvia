import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MatrixConfigEditor from "./MatrixConfigEditor";
import type { MatrixRow, QuestionOption } from "../../../../types/formBuilder";

interface Spy {
  rows: MatrixRow[];
  columns: QuestionOption[];
}

function Harness({
  rows,
  columns,
  spy,
}: {
  rows: MatrixRow[];
  columns: QuestionOption[];
  spy?: (state: Spy) => void;
}) {
  const [state, setState] = useState<Spy>({ rows, columns });
  const update = (next: Spy) => {
    setState(next);
    spy?.(next);
  };

  return (
    <MatrixConfigEditor
      rows={state.rows}
      columns={state.columns}
      onChangeRows={(r) => update({ ...state, rows: r })}
      onChangeColumns={(c) => update({ ...state, columns: c })}
    />
  );
}

const col = (id: string): QuestionOption => ({ id, text: `К ${id}`, isDefault: false });
const row = (id: string): MatrixRow => ({ id, text: `Р ${id}` });

describe("MatrixConfigEditor", () => {
  it("додає рядки й колонки з типовими підписами", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness rows={[row("r1")]} columns={[col("a"), col("b")]} spy={spy} />);

    await user.click(screen.getByRole("button", { name: "Додати рядок" }));
    expect(spy.mock.calls.at(-1)![0].rows.map((r: MatrixRow) => r.text)).toEqual(["Р r1", "Рядок 2"]);

    await user.click(screen.getByRole("button", { name: "Додати колонку" }));
    expect(spy.mock.calls.at(-1)![0].columns).toHaveLength(3);
  });

  it("id нових рядків і колонок унікальні", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness rows={[row("r1")]} columns={[col("a"), col("b")]} spy={spy} />);
    await user.click(screen.getByRole("button", { name: "Додати рядок" }));
    await user.click(screen.getByRole("button", { name: "Додати рядок" }));

    const ids = spy.mock.calls.at(-1)![0].rows.map((r: MatrixRow) => r.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("не дозволяє мати менше 1 рядка і менше 2 колонок", () => {
    render(<Harness rows={[row("r1")]} columns={[col("a"), col("b")]} />);

    expect(screen.getByRole("button", { name: "Видалити рядок 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Видалити колонку 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Видалити колонку 2" })).toBeDisabled();
  });

  it("видаляє рядок, коли їх більше одного", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness rows={[row("r1"), row("r2")]} columns={[col("a"), col("b")]} spy={spy} />);
    await user.click(screen.getByRole("button", { name: "Видалити рядок 1" }));

    expect(spy.mock.calls.at(-1)![0].rows.map((r: MatrixRow) => r.id)).toEqual(["r2"]);
  });

  it("блокує додавання понад 30 рядків і 10 колонок", () => {
    render(
      <Harness
        rows={Array.from({ length: 30 }, (_, i) => row(`r${i}`))}
        columns={Array.from({ length: 10 }, (_, i) => col(`c${i}`))}
      />,
    );

    expect(screen.getByRole("button", { name: "Додати рядок" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Додати колонку" })).toBeDisabled();
  });

  it("шкала Лайкерта замінює колонки п'ятьма підписами з новими id", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness rows={[row("r1")]} columns={[col("a"), col("b")]} spy={spy} />);
    await user.click(screen.getByRole("button", { name: "Шкала Лайкерта на 5 пунктів" }));

    const columns: QuestionOption[] = spy.mock.calls.at(-1)![0].columns;
    expect(columns.map((c) => c.text)).toEqual([
      "Повністю не згоден",
      "Не згоден",
      "Нейтрально",
      "Згоден",
      "Повністю згоден",
    ]);
    expect(new Set(columns.map((c) => c.id)).size).toBe(5);
  });

  it("редагує текст рядка", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();

    render(<Harness rows={[row("r1")]} columns={[col("a"), col("b")]} spy={spy} />);
    const input = screen.getByLabelText("Текст рядка 1");
    await user.clear(input);
    await user.type(input, "Якість");

    expect(spy.mock.calls.at(-1)![0].rows[0].text).toBe("Якість");
  });
});
