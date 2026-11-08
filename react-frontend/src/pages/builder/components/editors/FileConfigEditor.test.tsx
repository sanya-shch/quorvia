import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FILE_LIMITS } from "@quorvia/shared-types";
import FileConfigEditor from "./FileConfigEditor";

describe("FileConfigEditor", () => {
  it("defaults to one file", () => {
    render(<FileConfigEditor config={null} onChange={vi.fn()} />);

    expect(screen.getByLabelText("Максимальна кількість файлів")).toHaveValue("1");
  });

  it("offers 1 up to the maximum and no more", () => {
    render(<FileConfigEditor config={{ maxFiles: 2 }} onChange={vi.fn()} />);

    const options = screen.getAllByRole("option").map((option) => option.textContent);

    expect(options).toEqual(Array.from({ length: FILE_LIMITS.maxFilesPerQuestion }, (_, i) => String(i + 1)));
  });

  it("changes the limit and keeps the rest of the config", async () => {
    const onChange = vi.fn();
    render(<FileConfigEditor config={{ maxFiles: 1 }} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText("Максимальна кількість файлів"), "3");

    expect(onChange).toHaveBeenCalledWith({ maxFiles: 3 });
  });

  it("states the allowed types and the size limit", () => {
    render(<FileConfigEditor config={null} onChange={vi.fn()} />);

    expect(screen.getByText(/PDF, PNG, JPEG, WebP.*5 МБ/)).toBeInTheDocument();
  });
});
