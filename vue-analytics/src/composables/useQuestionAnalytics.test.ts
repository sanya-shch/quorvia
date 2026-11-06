import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiGet, ApiError } from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, apiGet: vi.fn() };
});

const mockedApiGet = vi.mocked(apiGet);

describe("getQuestionErrorMessage (чиста функція, без async/mock)", () => {
  it("ApiError -> повідомлення про деталі питання", async () => {
    const { getQuestionErrorMessage } = await import("./useQuestionAnalytics");
    expect(getQuestionErrorMessage(new ApiError(404, "x"))).toBe(
      "analytics.errors.questionDetailsLoadFailed",
    );
  });

  it("не-ApiError -> 'Помилка мережі'", async () => {
    const { getQuestionErrorMessage } = await import("./useQuestionAnalytics");
    expect(getQuestionErrorMessage(new TypeError("network down"))).toBe(
      "analytics.errors.networkError",
    );
  });
});

describe("useQuestionAnalytics (composable - loading/success шлях)", () => {
  beforeEach(() => mockedApiGet.mockReset());

  it("на відміну від useFormAnalytics/useFormPaths - НЕ фетчить одразу, isLoading=false до виклику load()", async () => {
    const { useQuestionAnalytics } = await import("./useQuestionAnalytics");
    const { isLoading, data } = useQuestionAnalytics("http://api.test", "form-1");

    expect(isLoading.value).toBe(false);
    expect(data.value).toBeNull();
    expect(mockedApiGet).not.toHaveBeenCalled();
  });

  it("load(questionId) фетчить правильний endpoint і заповнює data", async () => {
    mockedApiGet.mockResolvedValue({
      question: { id: "q1", text: "Q1", description: null, type: "TEXT" },
      totalAnswers: 5,
    });
    const { useQuestionAnalytics } = await import("./useQuestionAnalytics");
    const { data, isLoading, load } = useQuestionAnalytics("http://api.test", "form-1");

    const promise = load("q1");
    expect(isLoading.value).toBe(true);
    await promise;

    expect(isLoading.value).toBe(false);
    expect(data.value?.totalAnswers).toBe(5);
    expect(mockedApiGet).toHaveBeenCalledWith(
      "http://api.test",
      "/forms/form-1/questions/q1/analytics",
    );
  });

  it("повторний load() з новим questionId скидає попередні data перед новим фетчем", async () => {
    mockedApiGet
      .mockResolvedValueOnce({
        question: { id: "q1", text: "Q1", description: null, type: "TEXT" },
        totalAnswers: 1,
      })
      .mockReturnValueOnce(new Promise(() => {})); // the second call "hangs"

    const { useQuestionAnalytics } = await import("./useQuestionAnalytics");
    const { data, load } = useQuestionAnalytics("http://api.test", "form-1");

    await load("q1");
    expect(data.value?.totalAnswers).toBe(1);

    load("q2"); // we do not wait: we check the synchronous reset right after the call
    expect(data.value).toBeNull();
  });
});
