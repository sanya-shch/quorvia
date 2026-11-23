import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Question } from "../../../types/formBuilder";
import QuestionScoringEditor from "./QuestionScoringEditor";

const question = (overrides: Partial<Question> = {}): Question => ({
  id: "q",
  text: "Q",
  type: "CHOICE_SINGLE",
  required: false,
  order: 0,
  options: [
    { id: "a", text: "Київ", isDefault: false },
    { id: "b", text: "Львів", isDefault: false, score: 2 },
  ],
  config: null,
  ...overrides,
});

const setup = (q: Question, error?: string) => {
  const onChange = vi.fn();

  render(<QuestionScoringEditor question={q} onChange={onChange} error={error} />);

  return { onChange, user: userEvent.setup() };
};

describe("QuestionScoringEditor", () => {
  describe.each(["TEXT", "DATE", "RANKING", "MATRIX", "FILE"] as const)("for %s", (type) => {
    it("shows nothing: these answers give no points", () => {
      setup(question({ type }));

      expect(screen.queryByRole("group")).not.toBeInTheDocument();
    });
  });

  describe("a choice question", () => {
    it.each(["CHOICE_SINGLE", "CHOICE_MULTI", "IMAGE_CHOICE"] as const)(
      "has a field of points for every option (%s)",
      (type) => {
        setup(question({ type }));

        expect(screen.getByLabelText("Бали за «Київ»")).toHaveValue("");
        expect(screen.getByLabelText("Бали за «Львів»")).toHaveValue("2");
      },
    );

    it("sets the points of the option that was typed in, and keeps the others", async () => {
      const { onChange, user } = setup(question());

      await user.type(screen.getByLabelText("Бали за «Київ»"), "5");

      expect(onChange).toHaveBeenLastCalledWith({
        options: [
          { id: "a", text: "Київ", isDefault: false, score: 5 },
          { id: "b", text: "Львів", isDefault: false, score: 2 },
        ],
      });
    });

    it("removes the points when the field is emptied", async () => {
      const { onChange, user } = setup(question());

      await user.clear(screen.getByLabelText("Бали за «Львів»"));

      expect(onChange).toHaveBeenLastCalledWith({
        options: [
          { id: "a", text: "Київ", isDefault: false },
          { id: "b", text: "Львів", isDefault: false },
        ],
      });
    });

    it("accepts a decimal with a comma and negative points", async () => {
      const { onChange, user } = setup(question());

      await user.type(screen.getByLabelText("Бали за «Київ»"), "-0,5");

      expect(onChange).toHaveBeenLastCalledWith({
        options: [
          { id: "a", text: "Київ", isDefault: false, score: -0.5 },
          { id: "b", text: "Львів", isDefault: false, score: 2 },
        ],
      });
    });

    it("marks points that are not usable and does not report them", async () => {
      const { onChange, user } = setup(question());
      const field = screen.getByLabelText("Бали за «Київ»");

      await user.type(field, "1.234");

      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(onChange).not.toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.arrayContaining([expect.objectContaining({ score: 1.234 })]),
        }),
      );
    });

    it("says that picked options add up for multiple choice only", () => {
      setup(question({ type: "CHOICE_MULTI" }));

      expect(screen.getByText(/Бали всіх вибраних варіантів додаються/)).toBeInTheDocument();
    });

    it("names an option that has no text yet", () => {
      setup(question({ options: [{ id: "a", text: "", isDefault: false }] }));

      expect(screen.getByRole("group")).toHaveTextContent("Порожній варіант");
    });
  });

  describe("a yes/no question", () => {
    const boolean = (score?: { true: number; false: number }) =>
      question({ type: "BOOLEAN", options: [], config: { defaultValue: false, score } });

    it("has points for yes and for no", () => {
      setup(boolean({ true: 3, false: 1 }));

      expect(screen.getByLabelText("Бали за «Так»")).toHaveValue("3");
      expect(screen.getByLabelText("Бали за «Ні»")).toHaveValue("1");
    });

    it("stores both numbers when one is typed (the other becomes 0), keeping the rest of the config", async () => {
      const { onChange, user } = setup(boolean());

      await user.type(screen.getByLabelText("Бали за «Так»"), "4");

      expect(onChange).toHaveBeenLastCalledWith({
        config: { defaultValue: false, score: { true: 4, false: 0 } },
      });
    });

    it("keeps the other answer's points", async () => {
      const { onChange, user } = setup(boolean({ true: 3, false: 1 }));

      await user.clear(screen.getByLabelText("Бали за «Ні»"));
      await user.type(screen.getByLabelText("Бали за «Ні»"), "2");

      expect(onChange).toHaveBeenLastCalledWith({
        config: { defaultValue: false, score: { true: 3, false: 2 } },
      });
    });
  });

  describe.each(["NUMBER", "RATING", "SCALE", "NPS"] as const)("a %s question", (type) => {
    it("has a multiplier, which keeps the rest of the config", async () => {
      const { onChange, user } = setup(
        question({ type, options: [], config: { min: 0, max: 10 } }),
      );

      await user.type(screen.getByLabelText("Множник"), "2");

      expect(onChange).toHaveBeenLastCalledWith({
        config: { min: 0, max: 10, scoreMultiplier: 2 },
      });
    });

    it("clears the multiplier when the field is emptied", async () => {
      const { onChange, user } = setup(
        question({ type, options: [], config: { min: 0, max: 10, scoreMultiplier: 2 } }),
      );

      await user.clear(screen.getByLabelText("Множник"));

      expect(onChange).toHaveBeenLastCalledWith({
        config: { min: 0, max: 10, scoreMultiplier: null },
      });
    });
  });

  it("warns that a scored number needs a range, but not once it has one", () => {
    const { rerender } = render(
      <QuestionScoringEditor
        question={question({ type: "NUMBER", options: [], config: { scoreMultiplier: 2 } })}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("задайте і мінімум, і максимум");

    rerender(
      <QuestionScoringEditor
        question={question({
          type: "NUMBER",
          options: [],
          config: { scoreMultiplier: 2, min: 0, max: 5 },
        })}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error it is given", () => {
    setup(question(), "Щось не так");

    expect(within(screen.getByRole("group")).getByRole("alert")).toHaveTextContent("Щось не так");
  });

  it("shows the new value when it changes from outside", () => {
    const { rerender } = render(
      <QuestionScoringEditor question={question()} onChange={() => {}} />,
    );

    rerender(
      <QuestionScoringEditor
        question={question({
          options: [
            { id: "a", text: "Київ", isDefault: false, score: 9 },
            { id: "b", text: "Львів", isDefault: false },
          ],
        })}
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("Бали за «Київ»")).toHaveValue("9");
    expect(screen.getByLabelText("Бали за «Львів»")).toHaveValue("");
  });
});
