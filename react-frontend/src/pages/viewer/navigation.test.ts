import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redirectTo } from "./navigation";

describe("redirectTo", () => {
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockReset();
    vi.stubGlobal("location", { assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("goes to an absolute http(s) address", () => {
    expect(redirectTo("https://example.com/thanks")).toBe(true);
    expect(assign).toHaveBeenCalledWith("https://example.com/thanks");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "vbscript:x",
    "file:///etc/passwd",
    "//evil.test",
    "/relative",
    "",
    null,
    undefined,
    42,
  ])("does nothing for %j", (url) => {
    expect(redirectTo(url)).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});
