import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConfirmModal from "./ConfirmModal";
import Dialog from "./Dialog";

// Both modals use the shared motion classes from index.css. ConfirmModal used to carry
// `animate-in zoom-in-95` classes, which need a plugin the project does not have and did nothing.
describe("анімація модалок", () => {
  it("Dialog: підкладка з'являється, панель виїжджає", () => {
    render(
      <Dialog title="Поділитися" onClose={vi.fn()} closeLabel="Закрити">
        <p>вміст</p>
      </Dialog>,
    );

    const panel = screen.getByRole("dialog");
    expect(panel).toHaveClass("motion-dialog");
    expect(panel.parentElement).toHaveClass("motion-overlay");
  });

  it("ConfirmModal: ті самі класи, без мертвих animate-in", () => {
    render(
      <ConfirmModal
        isOpen
        title="Видалити?"
        description="Це не можна скасувати."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const overlay = screen.getByRole("dialog");
    expect(overlay).toHaveClass("motion-overlay");
    expect(overlay.firstElementChild).toHaveClass("motion-dialog");
    expect(overlay.outerHTML).not.toContain("animate-in");
  });

  it("закритий ConfirmModal нічого не рендерить", () => {
    const { container } = render(
      <ConfirmModal
        isOpen={false}
        title="Видалити?"
        description="Це не можна скасувати."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
