import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AnimatedNumber from "./AnimatedNumber.vue";

// Frames are driven by hand: the test decides how much time passes between two of them.
let pending: FrameRequestCallback | null;
let now: number;

const setReducedMotion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: reduce }));

const step = (ms: number) => {
  now += ms;
  const callback = pending;
  pending = null;
  callback?.(now);
};

const animated = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find("[aria-hidden]").element.textContent;

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

  it("рахує від нуля до значення, а фінальне число одразу в тексті для скрінрідера", () => {
    const wrapper = mount(AnimatedNumber, { props: { value: 42 } });

    expect(animated(wrapper)).toBe("0");
    // the final value is always readable, whatever frame the animation is on
    expect(wrapper.find(".sr-only").text()).toBe("42");

    step(16); // still inside the start delay
    expect(animated(wrapper)).toBe("0");

    step(300); // mid-way: past zero, short of the target
    const middle = Number(animated(wrapper));
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(42);

    step(2000);
    expect(animated(wrapper)).toBe("42");
  });

  it("десяткові знаки та суфікс: 75.0%", () => {
    const wrapper = mount(AnimatedNumber, { props: { value: 75, decimals: 1, suffix: "%" } });

    expect(animated(wrapper)).toBe("0.0%");
    expect(wrapper.find(".sr-only").text()).toBe("75.0%");

    step(2000);
    expect(animated(wrapper)).toBe("75.0%");
  });

  it("при зміні значення рахує від показаного числа, а не з нуля", async () => {
    const wrapper = mount(AnimatedNumber, { props: { value: 40 } });
    step(2000);
    expect(animated(wrapper)).toBe("40");

    await wrapper.setProps({ value: 50 });
    step(0); // the first frame of the new count
    expect(animated(wrapper)).toBe("40");
    expect(wrapper.find(".sr-only").text()).toBe("50");

    step(3000);
    expect(animated(wrapper)).toBe("50");
  });

  it("prefers-reduced-motion: число зʼявляється одразу, кадри не запитуються", () => {
    setReducedMotion(true);
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);

    const wrapper = mount(AnimatedNumber, { props: { value: 42 } });

    expect(animated(wrapper)).toBe("42");
    expect(raf).not.toHaveBeenCalled();
  });

  it("демонтаж скасовує запланований кадр", () => {
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);

    const wrapper = mount(AnimatedNumber, { props: { value: 42 } });
    wrapper.unmount();

    expect(cancel).toHaveBeenCalled();
  });
});
