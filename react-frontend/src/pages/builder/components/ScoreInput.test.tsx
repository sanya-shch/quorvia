import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScoreInput from "./ScoreInput";

// The input the way the editors use it: the parent keeps the value and hands it back.
function Harness({
  initial,
  onValue,
}: {
  initial: number | null | undefined;
  onValue: (v: number | null) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <>
      <ScoreInput
        label="Бали"
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue(next);
        }}
      />
      <button type="button" onClick={() => setValue(7)}>
        set 7
      </button>
      <output data-testid="value">{String(value)}</output>
    </>
  );
}

const setup = (initial?: number | null) => {
  const onValue = vi.fn();

  render(<Harness initial={initial} onValue={onValue} />);

  return { onValue, user: userEvent.setup(), field: screen.getByLabelText("Бали") };
};

describe("ScoreInput", () => {
  it("shows the points it is given, and nothing for none", () => {
    expect(setup(2.5).field).toHaveValue("2.5");
    document.body.innerHTML = "";
    expect(setup(null).field).toHaveValue("");
  });

  it("lets a decimal be typed digit by digit", async () => {
    const { onValue, user, field } = setup();

    await user.type(field, "12.25");

    expect(field).toHaveValue("12.25");
    expect(onValue).toHaveBeenLastCalledWith(12.25);
  });

  it("lets a negative number be typed, although '-' alone is not a number yet", async () => {
    const { onValue, user, field } = setup();

    await user.type(field, "-3");

    expect(field).toHaveValue("-3");
    expect(onValue).toHaveBeenLastCalledWith(-3);
    // Nothing was reported for the lone "-".
    expect(onValue).not.toHaveBeenCalledWith(Number.NaN);
  });

  it("does not report a value that is out of range or has too many decimals, and marks it", async () => {
    const { onValue, user, field } = setup();

    await user.type(field, "1000001");

    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(onValue).toHaveBeenLastCalledWith(100000);

    await user.clear(field);
    await user.type(field, "0.123");

    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveValue("0.123");
  });

  it("reports none when emptied", async () => {
    const { onValue, user, field } = setup(4);

    await user.clear(field);

    expect(onValue).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId("value")).toHaveTextContent("null");
  });

  it("keeps the text the author typed when it means the same number", async () => {
    const { user, field } = setup();

    await user.type(field, "5.0");

    expect(field).toHaveValue("5.0");
    expect(screen.getByTestId("value")).toHaveTextContent("5");
  });

  it("shows a value that changes from outside", async () => {
    const { user, field } = setup(1);

    await user.click(screen.getByRole("button", { name: "set 7" }));

    expect(field).toHaveValue("7");
  });
});
