import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useAttemptAutosave } from "./useAttemptAutosave";
import { saveFormAttempt } from "../../../api/publicFormApi";

vi.mock("../../../api/publicFormApi", () => ({
  saveFormAttempt: vi.fn(),
}));

const mockedSaveFormAttempt = vi.mocked(saveFormAttempt);

describe("useAttemptAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedSaveFormAttempt.mockReset();
    mockedSaveFormAttempt.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("не викликає saveFormAttempt синхронно - чекає debounce-паузу", () => {
    renderHook(() => useAttemptAutosave("share-1", "session-1", { q1: "текст" }));

    expect(mockedSaveFormAttempt).not.toHaveBeenCalled();
  });

  it("викликає saveFormAttempt після debounce-паузи, навіть з початковими (можливо порожніми) answers", () => {
    renderHook(() => useAttemptAutosave("share-1", "session-1", {}));

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(mockedSaveFormAttempt).toHaveBeenCalledWith("share-1", "session-1", {}, undefined);
  });

  it("не викликає saveFormAttempt взагалі, якщо shareId не передано", () => {
    renderHook(() => useAttemptAutosave(undefined, "session-1", { q1: "x" }));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockedSaveFormAttempt).not.toHaveBeenCalled();
  });

  it("швидкі послідовні зміни answers - лише ОДИН запит з фінальним значенням (справжній debounce)", () => {
    const { rerender } = renderHook(
      ({ answers }) => useAttemptAutosave("share-1", "session-1", answers),
      {
        initialProps: { answers: { q1: "а" } },
      },
    );

    act(() => {
      vi.advanceTimersByTime(400);
    });
    rerender({ answers: { q1: "аб" } });

    act(() => {
      vi.advanceTimersByTime(400);
    });
    rerender({ answers: { q1: "абв" } });

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(mockedSaveFormAttempt).toHaveBeenCalledTimes(1);
    expect(mockedSaveFormAttempt).toHaveBeenCalledWith("share-1", "session-1", { q1: "абв" }, undefined);
  });

  it("не дублює запит, якщо answers не змінились між рендерами", () => {
    const sameAnswers = { q1: "стабільне значення" };
    const { rerender } = renderHook(
      ({ answers }) => useAttemptAutosave("share-1", "session-1", answers),
      {
        initialProps: { answers: sameAnswers },
      },
    );

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(mockedSaveFormAttempt).toHaveBeenCalledTimes(1);

    rerender({ answers: { ...sameAnswers } });
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(mockedSaveFormAttempt).toHaveBeenCalledTimes(1);
  });

  it("прибирає незавершений таймер при unmount - не викликає saveFormAttempt після демонтажу", () => {
    const { unmount } = renderHook(() => useAttemptAutosave("share-1", "session-1", { q1: "x" }));

    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockedSaveFormAttempt).not.toHaveBeenCalled();
  });

  it("невдача saveFormAttempt не кидає непійману помилку (best-effort, мовчазний)", async () => {
    mockedSaveFormAttempt.mockRejectedValue(new Error("network down"));

    renderHook(() => useAttemptAutosave("share-1", "session-1", { q1: "x" }));

    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
    });

    expect(mockedSaveFormAttempt).toHaveBeenCalled();
  });

  it("передає reachedQuestionIds четвертим аргументом", () => {
    renderHook(() => useAttemptAutosave("share-1", "session-1", {}, ["q1", "q2"]));

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(mockedSaveFormAttempt).toHaveBeenCalledWith("share-1", "session-1", {}, ["q1", "q2"]);
  });

  it("зміна reachedQuestionIds БЕЗ зміни answers теж запускає збереження", () => {
    const answers = { q1: "x" };
    const { rerender } = renderHook(
      ({ reached }) => useAttemptAutosave("share-1", "session-1", answers, reached),
      { initialProps: { reached: ["q1"] } },
    );

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(mockedSaveFormAttempt).toHaveBeenCalledTimes(1);

    rerender({ reached: ["q1", "q2"] });
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(mockedSaveFormAttempt).toHaveBeenCalledTimes(2);
    expect(mockedSaveFormAttempt).toHaveBeenLastCalledWith("share-1", "session-1", answers, ["q1", "q2"]);
  });

  it("новий масив з тим самим вмістом НЕ запускає зайвого збереження", () => {
    const answers = { q1: "x" };
    const { rerender } = renderHook(
      ({ reached }) => useAttemptAutosave("share-1", "session-1", answers, reached),
      { initialProps: { reached: ["q1"] } },
    );

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    rerender({ reached: ["q1"] });
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(mockedSaveFormAttempt).toHaveBeenCalledTimes(1);
  });
});
