import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { END_RULE_LIMITS, type FormEndRule } from "@quorvia/shared-types";
import type { Question } from "../../../types/formBuilder";
import EndRulesEditor from "./EndRulesEditor";

const score: Question = {
  id: "q1",
  text: "Оцінка",
  type: "NUMBER",
  required: false,
  order: 0,
  options: [],
  config: null,
};

const rule = (id: string, overrides: Partial<FormEndRule> = {}): FormEndRule => ({
  id,
  condition: { logic: "AND", rules: [{ questionId: "q1", operator: "gt", value: 5 }] },
  screen: { text: `Текст ${id}`, redirectUrl: "" },
  ...overrides,
});

const setup = (rules: FormEndRule[] | null, questions: Question[] = [score]) => {
  const onChange = vi.fn();

  render(<EndRulesEditor rules={rules} questions={questions} onChange={onChange} />);

  return { onChange, user: userEvent.setup() };
};

const card = (n: number) => screen.getByRole("group", { name: `Правило ${n}` });

describe("EndRulesEditor", () => {
  it("shows only the add button while there are no rules", () => {
    setup(null);

    expect(screen.getByRole("button", { name: "Додати правило" })).toBeEnabled();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("adds a rule on the first usable question", async () => {
    const { onChange, user } = setup(null);

    await user.click(screen.getByRole("button", { name: "Додати правило" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toHaveLength(1);
    expect(onChange.mock.calls[0]![0][0]).toMatchObject({
      condition: { logic: "AND", rules: [{ questionId: "q1", value: "" }] },
      screen: { text: "" },
    });
  });

  it("appends the new rule after the existing ones", async () => {
    const { onChange, user } = setup([rule("a")]);

    await user.click(screen.getByRole("button", { name: "Додати правило" }));

    expect(onChange.mock.calls[0]![0].map((r: FormEndRule) => r.id)[0]).toBe("a");
    expect(onChange.mock.calls[0]![0]).toHaveLength(2);
  });

  it("cannot add a rule without a usable question, and says why", () => {
    setup(null, [{ ...score, type: "RANKING" }]);

    expect(screen.getByRole("button", { name: "Додати правило" })).toBeDisabled();
    expect(screen.getByText(/Додайте питання, яке можна використати в умовах/)).toBeInTheDocument();
  });

  it("cannot add more rules than the limit", () => {
    const rules = Array.from({ length: END_RULE_LIMITS.rules }, (_, i) => rule(`r${i}`));

    setup(rules);

    expect(screen.getByRole("button", { name: "Додати правило" })).toBeDisabled();
    expect(screen.getByText(`Не більше ${END_RULE_LIMITS.rules} правил.`)).toBeInTheDocument();
  });

  it("edits the message and the redirect of the right rule", async () => {
    const { onChange, user } = setup([rule("a"), rule("b")]);

    await user.type(within(card(2)).getByLabelText("Повідомлення"), "!");

    expect(onChange.mock.calls.at(-1)![0][1].screen.text).toBe("Текст b!");
    expect(onChange.mock.calls.at(-1)![0][0].screen.text).toBe("Текст a");

    await user.type(within(card(1)).getByLabelText(/Адреса для переходу/), "h");

    expect(onChange.mock.calls.at(-1)![0][0].screen.redirectUrl).toBe("h");
  });

  it("changes the value of a condition", () => {
    const { onChange } = setup([rule("a")]);

    // The editor is controlled and the props do not change here, so one change event at a time.
    fireEvent.change(within(card(1)).getByRole("spinbutton"), { target: { value: "9" } });

    expect(onChange.mock.calls.at(-1)![0][0].condition.rules[0].value).toBe(9);
  });

  it("moves rules up and down, with the first and last disabled", async () => {
    const { onChange, user } = setup([rule("a"), rule("b"), rule("c")]);

    expect(within(card(1)).getByRole("button", { name: "Вище" })).toBeDisabled();
    expect(within(card(3)).getByRole("button", { name: "Нижче" })).toBeDisabled();

    await user.click(within(card(3)).getByRole("button", { name: "Вище" }));

    expect(onChange.mock.calls[0]![0].map((r: FormEndRule) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("removes a rule, and reports none when the last one goes", async () => {
    const first = setup([rule("a"), rule("b")]);

    await first.user.click(within(card(1)).getByRole("button", { name: "Видалити правило" }));
    expect(first.onChange.mock.calls[0]![0].map((r: FormEndRule) => r.id)).toEqual(["b"]);
  });

  it("reports null when the only rule is removed", async () => {
    const { onChange, user } = setup([rule("a")]);

    await user.click(screen.getByRole("button", { name: "Видалити правило" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("does not let the last condition of a rule be removed (a rule needs one)", () => {
    setup([rule("a")]);

    expect(screen.queryByRole("button", { name: "Видалити умову" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  describe("warnings", () => {
    it("says an unfinished rule is not saved", () => {
      setup([
        rule("a", { screen: { text: "" } }),
        rule("b", {
          condition: { logic: "AND", rules: [{ questionId: "q1", operator: "gt", value: "" }] },
        }),
      ]);

      expect(within(card(1)).getByText(/Введіть повідомлення/)).toBeInTheDocument();
      expect(within(card(2)).getByText(/Заповніть значення кожної умови/)).toBeInTheDocument();
    });

    it("warns about a redirect that is not http(s)", () => {
      setup([rule("a", { screen: { text: "Hi", redirectUrl: "javascript:alert(1)" } })]);

      expect(screen.getByText(/Вкажіть повну адресу/)).toBeInTheDocument();
    });

    it("flags a rule that looks at a deleted question", () => {
      setup([
        rule("a", {
          condition: { logic: "AND", rules: [{ questionId: "gone", operator: "gt", value: 1 }] },
        }),
      ]);

      expect(within(card(1)).getByText(/посилається на питання, яке видалено/)).toBeInTheDocument();
    });
  });
});
