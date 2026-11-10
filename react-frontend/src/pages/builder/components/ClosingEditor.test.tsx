import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MAX_RESPONSES_LIMIT } from "@quorvia/shared-types";
import ClosingEditor from "./ClosingEditor";
import { isoToLocalInput } from "../closing";

const HOUR_MS = 60 * 60 * 1000;
const future = () => new Date(Date.now() + 48 * HOUR_MS).toISOString();
const past = () => new Date(Date.now() - 48 * HOUR_MS).toISOString();

const setup = (props: Partial<Parameters<typeof ClosingEditor>[0]> = {}) => {
  const onChange = vi.fn();

  render(
    <ClosingEditor
      closesAt={null}
      maxResponses={null}
      responseCount={0}
      onChange={onChange}
      {...props}
    />,
  );

  return { onChange };
};

const dateField = () => screen.getByLabelText("Закрити") as HTMLInputElement;
const maxField = () =>
  screen.getByLabelText("Максимальна кількість відповідей") as HTMLInputElement;

describe("ClosingEditor", () => {
  it("is empty for a form without limits and says how many responses it has", () => {
    setup({ responseCount: 14 });

    expect(dateField()).toHaveValue("");
    expect(maxField()).toHaveValue(null);
    expect(screen.getByText("Зібрано: 14 з ∞")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the saved limits", () => {
    const closesAt = future();
    setup({ closesAt, maxResponses: 100, responseCount: 7 });

    expect(dateField()).toHaveValue(isoToLocalInput(closesAt));
    expect(maxField()).toHaveValue(100);
    expect(screen.getByText("Зібрано: 7 з 100")).toBeInTheDocument();
  });

  it("sends the chosen moment as an ISO instant", () => {
    const { onChange } = setup();

    fireEvent.change(dateField(), { target: { value: "2030-06-15T10:30" } });

    const { closesAt } = onChange.mock.calls[0]![0];
    expect(closesAt).toMatch(/^2030-06-15T\d{2}:\d{2}:00\.000Z$/);
    expect(new Date(closesAt).getHours() % 24).toBeDefined();
  });

  it("clearing the date removes it", () => {
    const { onChange } = setup({ closesAt: future() });

    fireEvent.change(dateField(), { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith({ closesAt: null });
  });

  it("sends the typed maximum as a whole number", () => {
    const { onChange } = setup();

    fireEvent.change(maxField(), { target: { value: "25" } });

    expect(onChange).toHaveBeenLastCalledWith({ maxResponses: 25 });
  });

  it.each(["", "0", "-5", "2.5"])("turns %j into no limit", (typed) => {
    const { onChange } = setup({ maxResponses: 10 });

    fireEvent.change(maxField(), { target: { value: typed } });

    expect(onChange).toHaveBeenCalledWith({ maxResponses: null });
  });

  it("clamps an absurdly large maximum", () => {
    const { onChange } = setup();

    fireEvent.change(maxField(), { target: { value: String(MAX_RESPONSES_LIMIT * 10) } });

    expect(onChange).toHaveBeenCalledWith({ maxResponses: MAX_RESPONSES_LIMIT });
  });

  it("warns that the form is closed by date, and how to reopen it", () => {
    setup({ closesAt: past() });

    expect(screen.getByRole("status")).toHaveTextContent("Дата закриття минула");
    expect(screen.getByRole("status")).toHaveTextContent("Оберіть пізнішу дату");
  });

  it("warns that the form is closed by the limit", () => {
    setup({ maxResponses: 5, responseCount: 5 });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Досягнуто максимальної кількості відповідей",
    );
  });

  it("stays quiet while the form is open by both rules", () => {
    setup({ closesAt: future(), maxResponses: 5, responseCount: 4 });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
