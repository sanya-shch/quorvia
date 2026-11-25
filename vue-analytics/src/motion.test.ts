import { afterEach, describe, expect, it, vi } from "vitest";
import { easeOutExpo, motionDurationMs } from "./motion";

const stubToken = (value: string) =>
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    getPropertyValue: () => value,
  } as unknown as CSSStyleDeclaration);

describe("motionDurationMs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("читає мілісекунди та секунди з токена", () => {
    stubToken(" 800ms ");
    expect(motionDurationMs("--motion-duration-count", 1)).toBe(800);

    stubToken("0.5s");
    expect(motionDurationMs("--motion-duration-count", 1)).toBe(500);
  });

  it("без стилів або з незрозумілим значенням повертає запасне", () => {
    stubToken("");
    expect(motionDurationMs("--motion-duration-count", 777)).toBe(777);

    stubToken("fast");
    expect(motionDurationMs("--motion-duration-count", 777)).toBe(777);

    stubToken("12");
    expect(motionDurationMs("--motion-duration-count", 777)).toBe(777);
  });
});

describe("easeOutExpo", () => {
  it("починається в нулі, закінчується в одиниці та монотонна", () => {
    expect(easeOutExpo(0)).toBe(0);
    expect(easeOutExpo(1)).toBe(1);
    expect(easeOutExpo(1.5)).toBe(1);
    expect(easeOutExpo(0.25)).toBeLessThan(easeOutExpo(0.5));
    expect(easeOutExpo(0.5)).toBeLessThan(easeOutExpo(0.9));
  });
});
