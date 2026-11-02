import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const animateMock = vi.hoisted(() => vi.fn());
vi.mock("motion/mini", () => ({ animate: animateMock }));

const { playToastAnimation } = await import("./toastMotion");

const el = () => {
  const element = document.createElement("div");
  element.animate = vi.fn() as never; // у jsdom WAAPI немає - імітуємо підтримку
  return element;
};

const setReducedMotion = (reduce: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: reduce }),
  );

describe("playToastAnimation", () => {
  beforeEach(() => {
    animateMock.mockReset();
    animateMock.mockReturnValue({ finished: Promise.resolve() });
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("вхід: з'являється знизу з масштабом і прозорістю", async () => {
    const element = el();

    await playToastAnimation(element, "enter");

    const [target, keyframes, options] = animateMock.mock.calls[0];
    expect(target).toBe(element);
    expect(keyframes.opacity).toEqual([0, 1]);
    expect(keyframes.transform).toEqual(["translateY(24px) scale(0.96)", "translateY(0) scale(1)"]);
    expect(options.duration).toBeGreaterThan(0);
  });

  it("вихід: зменшується й тане, і триває коротше за вхід", async () => {
    await playToastAnimation(el(), "enter");
    await playToastAnimation(el(), "exit");

    const [, exitKeyframes, exitOptions] = animateMock.mock.calls[1];
    expect(exitKeyframes.opacity).toEqual([1, 0]);
    expect(exitKeyframes.transform).toEqual(["scale(1)", "scale(0.96)"]);
    expect(exitOptions.duration).toBeLessThan(animateMock.mock.calls[0][2].duration);
  });

  it("prefers-reduced-motion: без руху, лише прозорість", async () => {
    setReducedMotion(true);

    await playToastAnimation(el(), "enter");
    await playToastAnimation(el(), "exit");

    for (const [, keyframes] of animateMock.mock.calls) {
      expect(keyframes.transform).toBeUndefined();
      expect(keyframes.opacity).toBeDefined();
    }
  });

  it("без WAAPI (element.animate відсутній) нічого не робить і не падає", async () => {
    const plain = document.createElement("div"); // jsdom: animate undefined

    await expect(playToastAnimation(plain, "enter")).resolves.toBeUndefined();
    expect(animateMock).not.toHaveBeenCalled();
  });

  it("помилка анімації не пробивається назовні (інакше повідомлення не зникло б)", async () => {
    animateMock.mockReturnValue({ finished: Promise.reject(new Error("cancelled")) });

    await expect(playToastAnimation(el(), "exit")).resolves.toBeUndefined();
  });

  it("синхронна помилка animate() теж поглинається", async () => {
    animateMock.mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(playToastAnimation(el(), "exit")).resolves.toBeUndefined();
  });
});
