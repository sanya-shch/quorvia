import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { createElement, type ReactNode } from "react";
import { useAttemptAutosave } from "./useAttemptAutosave";
import { QuotaWarningContext, type QuotaFullInfo } from "../quotaWarning";
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
    expect(mockedSaveFormAttempt).toHaveBeenCalledWith(
      "share-1",
      "session-1",
      { q1: "абв" },
      undefined,
    );
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
    expect(mockedSaveFormAttempt).toHaveBeenLastCalledWith("share-1", "session-1", answers, [
      "q1",
      "q2",
    ]);
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

describe("useAttemptAutosave: news about a full quota", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedSaveFormAttempt.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = () => {
    const report = vi.fn<(info: QuotaFullInfo | null) => void>();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QuotaWarningContext.Provider, { value: report }, children);

    return { report, wrapper };
  };

  const settle = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
  };

  it("reports the quota the server found full, with the owner's message", async () => {
    const { report, wrapper } = setup();

    mockedSaveFormAttempt.mockResolvedValue({
      id: "a",
      updatedAt: "x",
      quotaFull: { message: "Київ заповнено" },
    });
    renderHook(() => useAttemptAutosave("share-1", "session-1", { q1: "а" }), { wrapper });
    await settle();

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({ message: "Київ заповнено" });
  });

  it("reports null when no quota is full, and when the server says nothing about it", async () => {
    const { report, wrapper } = setup();

    mockedSaveFormAttempt.mockResolvedValue({ id: "a", updatedAt: "x", quotaFull: null });
    renderHook(() => useAttemptAutosave("share-1", "session-1", { q1: "а" }), { wrapper });
    await settle();

    mockedSaveFormAttempt.mockResolvedValue(undefined as never);
    renderHook(() => useAttemptAutosave("share-1", "session-2", { q1: "б" }), { wrapper });
    await settle();

    expect(report.mock.calls).toEqual([[null], [null]]);
  });

  it("reports nothing when the save fails", async () => {
    const { report, wrapper } = setup();

    mockedSaveFormAttempt.mockRejectedValue(new Error("offline"));
    renderHook(() => useAttemptAutosave("share-1", "session-1", { q1: "а" }), { wrapper });
    await settle();

    expect(report).not.toHaveBeenCalled();
  });

  it("only the answer to the latest save counts: a slower, older one cannot bring a warning back", async () => {
    const { report, wrapper } = setup();
    let finishFirst!: (value: { id: string; updatedAt: string; quotaFull: QuotaFullInfo }) => void;

    mockedSaveFormAttempt
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce({ id: "a", updatedAt: "x", quotaFull: null });

    const { rerender } = renderHook(
      ({ answers }) => useAttemptAutosave("share-1", "session-1", answers),
      { wrapper, initialProps: { answers: { q1: "а" } } },
    );

    await settle();
    rerender({ answers: { q1: "аб" } });
    await settle();

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenLastCalledWith(null);

    // The first request answers last, with a warning that the newer save has already replaced.
    await act(async () => finishFirst({ id: "a", updatedAt: "x", quotaFull: { message: null } }));

    expect(report).toHaveBeenCalledTimes(1);
  });

  it("does not need anyone to listen", async () => {
    mockedSaveFormAttempt.mockResolvedValue({
      id: "a",
      updatedAt: "x",
      quotaFull: { message: null },
    });

    expect(() => renderHook(() => useAttemptAutosave("share-1", "session-1", {}))).not.toThrow();
    await settle();
  });
});
