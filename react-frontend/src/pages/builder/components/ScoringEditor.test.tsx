import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SCORE_LIMITS } from "@quorvia/shared-types";
import type { ScoringDraft } from "../../../types/formBuilder";
import ScoringEditor from "./ScoringEditor";

const cat = (id: string, label: string, min: string, max: string) => ({ id, label, min, max });

const setup = (scoring: ScoringDraft | null | undefined) => {
  const onChange = vi.fn();

  render(<ScoringEditor scoring={scoring} onChange={onChange} />);

  return { onChange, user: userEvent.setup() };
};

const switchLabel = "Рахувати бали за відповіді";

describe("ScoringEditor", () => {
  it("is off by default, and shows only the switch", () => {
    setup(null);

    expect(screen.getByRole("checkbox", { name: switchLabel })).not.toBeChecked();
    expect(screen.queryByText("Категорії результату")).not.toBeInTheDocument();
  });

  it("is switched on and off, keeping the categories", async () => {
    const draft = { enabled: false, categories: [cat("a", "A", "0", "5")] };
    const first = setup(draft);

    await first.user.click(screen.getByRole("checkbox", { name: switchLabel }));

    expect(first.onChange).toHaveBeenLastCalledWith({
      enabled: true,
      categories: draft.categories,
    });
  });

  it("starts from nothing when switched on for the first time", async () => {
    const { onChange, user } = setup(undefined);

    await user.click(screen.getByRole("checkbox", { name: switchLabel }));

    expect(onChange).toHaveBeenLastCalledWith({ enabled: true, categories: [] });
  });

  it("lists the categories once on, with the placeholders the end screen can use", () => {
    setup({ enabled: true, categories: [cat("a", "Початківець", "0", "30")] });

    const group = screen.getByRole("group", { name: "Початківець" });

    expect(within(group).getByLabelText("Назва")).toHaveValue("Початківець");
    expect(within(group).getByLabelText("Від")).toHaveValue("0");
    expect(within(group).getByLabelText("До")).toHaveValue("30");
    expect(screen.getByText(/\{\{score\}\}/)).toBeInTheDocument();
  });

  it("adds an empty category with its own id", async () => {
    const { onChange, user } = setup({ enabled: true, categories: [] });

    await user.click(screen.getByRole("button", { name: "Додати категорію" }));

    const [added] = onChange.mock.calls[0]![0].categories;

    expect(added).toMatchObject({ label: "", min: "", max: "" });
    expect(added.id).toBeTruthy();
  });

  it("cannot add more than the limit", () => {
    setup({
      enabled: true,
      categories: Array.from({ length: SCORE_LIMITS.categories }, (_, i) =>
        cat(`c${i}`, `C${i}`, String(i * 10), String(i * 10 + 5)),
      ),
    });

    expect(screen.getByRole("button", { name: "Додати категорію" })).toBeDisabled();
  });

  it("edits one category without touching the others", () => {
    const { onChange } = setup({
      enabled: true,
      categories: [cat("a", "A", "0", "5"), cat("b", "B", "6", "9")],
    });
    const second = screen.getByRole("group", { name: "B" });

    fireEvent.change(within(second).getByLabelText("До"), { target: { value: "12" } });

    expect(onChange.mock.calls[0]![0].categories).toEqual([
      cat("a", "A", "0", "5"),
      cat("b", "B", "6", "12"),
    ]);
  });

  it("removes a category", async () => {
    const { onChange, user } = setup({
      enabled: true,
      categories: [cat("a", "A", "0", "5"), cat("b", "B", "6", "9")],
    });

    await user.click(
      within(screen.getByRole("group", { name: "A" })).getByRole("button", {
        name: "Видалити категорію",
      }),
    );

    expect(onChange.mock.calls[0]![0].categories).toEqual([cat("b", "B", "6", "9")]);
  });

  describe("tells what is wrong with a category", () => {
    it("an unfinished one will not be saved", () => {
      setup({ enabled: true, categories: [cat("a", "", "0", "")] });

      expect(screen.getByRole("alert")).toHaveTextContent("інакше цю категорію не буде збережено");
    });

    it("a range that runs backwards", () => {
      setup({ enabled: true, categories: [cat("a", "A", "9", "2")] });

      expect(screen.getByRole("alert")).toHaveTextContent("«Від» більше за «До»");
    });

    it("a range that overlaps an earlier category, and only that one", () => {
      setup({ enabled: true, categories: [cat("a", "A", "0", "10"), cat("b", "B", "5", "15")] });

      expect(
        within(screen.getByRole("group", { name: "A" })).queryByRole("alert"),
      ).not.toBeInTheDocument();
      expect(within(screen.getByRole("group", { name: "B" })).getByRole("alert")).toHaveTextContent(
        "перетинається",
      );
    });

    it("nothing for categories that are fine", () => {
      setup({ enabled: true, categories: [cat("a", "A", "0", "10"), cat("b", "B", "11", "20")] });

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
