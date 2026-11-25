import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnimatedNumber from "./AnimatedNumber";

// Frames are driven by hand: the test decides how much time passes between two of them.
let pending: FrameRequestCallback | null;
let now: number;

const setReducedMotion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: reduce }));

const step = (ms: number) =>
  act(() => {
    now += ms;
    const callback = pending;
    pending = null;
    callback?.(now);
  });

const animated = (container: HTMLElement) => container.querySelector("[aria-hidden]")!.textContent;

describe("AnimatedNumber", () => {
  beforeEach(() => {
    pending = null;
    now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      pending = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("рахує від нуля до значення, а фінальне число одразу в тексті для скрінрідера", async () => {
    const { container } = render(<AnimatedNumber value={42} />);

    expect(animated(container)).toBe("0");
    // the final value is always readable, whatever frame the animation is on
    expect(screen.getByText("42")).toHaveClass("sr-only");

    await step(16); // still inside the start delay
    expect(animated(container)).toBe("0");

    await step(300); // mid-way: past zero, short of the target
    const middle = Number(animated(container));
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(42);

    await step(2000);
    expect(animated(container)).toBe("42");
  });

  it("десяткові знаки та суфікс: 75.0%", async () => {
    const { container } = render(<AnimatedNumber value={75} decimals={1} suffix="%" />);

    expect(animated(container)).toBe("0.0%");
    expect(screen.getByText("75.0%")).toHaveClass("sr-only");

    await step(2000);
    expect(animated(container)).toBe("75.0%");
  });

  it("при зміні значення рахує від показаного числа, а не з нуля", async () => {
    const { container, rerender } = render(<AnimatedNumber value={40} />);
    await step(2000);
    expect(animated(container)).toBe("40");

    rerender(<AnimatedNumber value={50} />);
    await step(0); // the first frame of the new count
    expect(animated(container)).toBe("40");

    await step(3000);
    expect(animated(container)).toBe("50");
  });

  it("prefers-reduced-motion: число зʼявляється одразу, кадри не запитуються", () => {
    setReducedMotion(true);
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);

    const { container } = render(<AnimatedNumber value={42} />);

    expect(animated(container)).toBe("42");
    expect(raf).not.toHaveBeenCalled();
  });

  it("демонтаж скасовує запланований кадр", () => {
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);

    const { unmount } = render(<AnimatedNumber value={42} />);
    unmount();

    expect(cancel).toHaveBeenCalled();
  });
});
