import { describe, expect, it } from "vitest";
import { isoToLocalInput, localInputToIso } from "./closing";

describe("closing date helpers", () => {
  it("round-trips an instant through the local input without drifting", () => {
    const iso = "2030-06-15T10:30:00.000Z";

    expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
  });

  it("round-trips whatever the time zone is (the local text is only a view of the instant)", () => {
    for (const iso of [
      "2030-01-01T00:00:00.000Z",
      "2030-03-31T01:30:00.000Z",
      "2030-12-31T23:59:00.000Z",
    ]) {
      expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
    }
  });

  it("formats the input value as local date and time to the minute", () => {
    expect(isoToLocalInput("2030-06-15T10:30:45.000Z")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("reads the typed local time as the browser's time zone", () => {
    const iso = localInputToIso("2030-06-15T10:30");

    expect(new Date(iso!).getFullYear()).toBe(2030);
    expect(new Date(iso!).getMinutes()).toBe(30);
    expect(new Date(iso!).getHours()).toBe(10);
  });

  it.each([null, undefined, "", "not a date"])("shows nothing for %j", (value) => {
    expect(isoToLocalInput(value)).toBe("");
  });

  it.each(["", "garbage", "2030-13-45T99:99"])("turns %j into no date", (value) => {
    expect(localInputToIso(value)).toBeNull();
  });
});
