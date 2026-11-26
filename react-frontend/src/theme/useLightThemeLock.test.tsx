import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLightThemeLock } from "./useLightThemeLock";

const Locked = () => {
  useLightThemeLock();
  return null;
};

describe("useLightThemeLock", () => {
  it("тримає сторінку у світлій темі, поки компонент змонтований, і знімає замок після", () => {
    const root = document.documentElement;
    expect(root.dataset.themeLock).toBeUndefined();

    const { unmount } = render(<Locked />);
    expect(root.dataset.themeLock).toBe("light");

    unmount();
    expect(root.dataset.themeLock).toBeUndefined();
  });
});
