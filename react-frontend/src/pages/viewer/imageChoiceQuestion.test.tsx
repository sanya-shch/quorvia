import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FormViewer from "./FormViewer";
import type { Question } from "../../types/formBuilder";

vi.mock("../../api/assets", () => ({
  assetUrl: (id: string) => `http://api.test/assets/${id}`,
}));

const options = [
  { id: "a", text: "Море", isDefault: false, imageAssetId: "img-sea" },
  { id: "b", text: "Гори", isDefault: false, imageAssetId: "img-mountains" },
  { id: "c", text: "Без картинки", isDefault: false },
];

const q = (overrides: Partial<Question> = {}): Question => ({
  id: "q",
  type: "IMAGE_CHOICE",
  text: "Куди поїдемо?",
  required: false,
  order: 0,
  options,
  config: null,
  ...overrides,
});

const SUBMIT = { name: "Надіслати відповіді" };

describe("FormViewer - IMAGE_CHOICE", () => {
  it("shows a card per option as a radio group named by the question", () => {
    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={vi.fn()} />);

    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Море" })).toBeInTheDocument();
  });

  it("renders the pictures of the options that have one, decoratively", () => {
    const { container } = render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={vi.fn()} />);
    const images = [...container.querySelectorAll("img")];

    expect(images.map((img) => img.getAttribute("src"))).toEqual([
      "http://api.test/assets/img-sea",
      "http://api.test/assets/img-mountains",
    ]);
    // The text label names the option, so the picture adds nothing for a screen reader.
    expect(images.every((img) => img.getAttribute("alt") === "")).toBe(true);
  });

  it("submits the id of the chosen option", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("radio", { name: "Гори" }));
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ q: "b" });
  });

  it("marks only the chosen option as checked and lets the choice change", async () => {
    const user = userEvent.setup();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: "Море" }));
    await user.click(screen.getByRole("radio", { name: "Без картинки" }));

    expect(screen.getByRole("radio", { name: "Море" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Без картинки" })).toBeChecked();
  });

  it("can be operated from the keyboard", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={onSubmit} />);
    await user.tab();
    await user.keyboard(" ");
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({ q: "a" });
  });

  it("does not send an answer for an optional question left empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q()]} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it("blocks the submit of a required question without a choice", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<FormViewer formTitle="Т" questions={[q({ required: true })]} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", SUBMIT));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/обов/i)).toBeInTheDocument();
  });
});
