import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QUESTION_TYPES } from "@quorvia/shared-types";
import i18n from "../../i18n";
import { QUESTION_TYPE_LABEL_KEYS } from "../../constants";
import QuestionTypePicker from "./editor/QuestionTypePicker";
import { ADVANCED_TYPES, ALL_TYPES, BASIC_TYPES, TYPE_ICONS } from "./editor/questionTypeMeta";

// Completeness guard: TypeScript cannot see that for a new question type the picker entry, the icon
// or the uk/en translation was forgotten. This test walks the whole QUESTION_TYPES from
// shared-types and fails if anything is missing.
describe("покриття типів питань у конструкторі", () => {
  it("кожен тип має ключ підпису й іконку", () => {
    for (const type of QUESTION_TYPES) {
      expect(QUESTION_TYPE_LABEL_KEYS[type], type).toBeTruthy();
      expect(TYPE_ICONS[type], type).toBeTruthy();
    }
  });

  it("кожен тип є у списку вибору рівно один раз (базові + розширені не перетинаються)", () => {
    expect([...ALL_TYPES].sort()).toEqual([...QUESTION_TYPES].sort());
    expect(BASIC_TYPES.filter((type) => ADVANCED_TYPES.includes(type))).toEqual([]);
  });

  it.each(["uk", "en"])("кожен тип має переклад підпису (%s)", (lng) => {
    for (const type of QUESTION_TYPES) {
      const key = QUESTION_TYPE_LABEL_KEYS[type];

      expect(i18n.exists(key, { lng }), `${lng}: ${key}`).toBe(true);
    }
  });

  it("вибір типу пропонує кожен тип рівно один раз і додає саме його", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();

    render(<QuestionTypePicker onPick={onPick} onClose={vi.fn()} />);

    const items = screen.getAllByRole("button");
    expect(items).toHaveLength(QUESTION_TYPES.length);

    for (const [index, type] of ALL_TYPES.entries()) {
      onPick.mockClear();
      await user.click(screen.getAllByRole("button")[index]);
      expect(onPick).toHaveBeenCalledWith(type);
    }
  });
});
