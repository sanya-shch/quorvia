import { beforeEach, describe, expect, it, vi } from "vitest";
import { configure, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formsApi } from "../../api/forms";
import { workspaceApi } from "../../api/workspaceApi";
import { renderWorkspace } from "./renderWorkspace";
import { adminForm } from "./testFixtures";

vi.setConfig({ testTimeout: 20000 });
// The suite runs many files in parallel: async lookups need more room than the 1 s default.
configure({ asyncUtilTimeout: 5000 });

vi.mock("../../api/forms", () => ({
  formsApi: {
    getAdminForm: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    duplicate: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../api/workspaceApi", () => ({
  workspaceApi: {
    getSummary: vi.fn(),
    getFunnel: vi.fn(),
    getResponses: vi.fn(),
    listExports: vi.fn(),
    createExport: vi.fn(),
    downloadExport: vi.fn(),
  },
}));
vi.mock("../analytics/components/VueAnalyticsHost", () => ({ default: () => null }));

const get = vi.mocked(formsApi.getAdminForm);
const update = vi.mocked(formsApi.update);
const publish = vi.mocked(formsApi.publish);
const summary = vi.mocked(workspaceApi.getSummary);
const funnel = vi.mocked(workspaceApi.getFunnel);
const responses = vi.mocked(workspaceApi.getResponses);

const totals = (o: Record<string, unknown> = {}) => ({
  responses: 9,
  started: 12,
  completed: 9,
  abandoned: 3,
  completionRate: 0.75,
  medianCompletionSeconds: 134,
  ...o,
});

const withData = () => {
  summary.mockResolvedValue({
    period: { from: null, to: null },
    current: totals(),
    previous: totals({ responses: 6, started: 12, completionRate: 0.5 }),
    daily: [
      { date: "2026-11-15", started: 3, submitted: 2 },
      { date: "2026-11-16", started: 4, submitted: 3 },
      { date: "2026-11-17", started: 5, submitted: 4 },
    ],
  } as never);
  funnel.mockResolvedValue({
    totalAttempts: 12,
    totalCompletions: 9,
    completionRate: 0.75,
    medianCompletionSeconds: 134,
    nodes: [
      { questionId: "q1", text: "Перше", order: 0, reachedCount: 12, exitedCount: 1 },
      { questionId: "q2", text: "Друге", order: 1, reachedCount: 11, exitedCount: 2 },
      { questionId: "q3", text: "Третє", order: 2, reachedCount: 9, exitedCount: 0 },
    ],
  } as never);
  responses.mockResolvedValue({
    data: [{ id: "abcdef123456", createdAt: "2026-11-17T10:36:00.000Z" }],
    total: 1,
    page: 1,
    limit: 5,
  } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  withData();
});

describe("Огляд форми", () => {
  it("опублікована форма з відповідями: показники, воронка, останні відповіді", async () => {
    get.mockResolvedValue(adminForm({ isPublished: true, responseCount: 9 }));

    renderWorkspace("/forms/form-1/overview");

    expect(await screen.findByRole("heading", { name: "Опитування" })).toBeInTheDocument();
    // the completion rate is in the KPI card and in the funnel
    expect((await screen.findAllByText("75.0%")).length).toBeGreaterThanOrEqual(2);
    // attempts and completed responses are different numbers
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(await screen.findByText("Q2")).toBeInTheDocument(); // the question with the most exits
    const link = await screen.findByRole("link", { name: "Відкрити" });
    expect(link).toHaveAttribute("href", "/forms/form-1/responses?response=abcdef123456");
  });

  it("порівнює з попереднім періодом лише там, де є з чим порівнювати", async () => {
    get.mockResolvedValue(adminForm({ isPublished: true, responseCount: 9 }));

    renderWorkspace("/forms/form-1/overview");

    // 9 vs 6 responses: +50.0 %
    expect(await screen.findByText(/\+50\.0%/)).toBeInTheDocument();

    await userEvent.setup().click(await screen.findByRole("button", { name: "Весь час" }));

    // "all time" has nothing before it: no change is invented
    expect(screen.queryByText(/\+50\.0%/)).not.toBeInTheDocument();
  });

  it("чернетка: готовність і налаштування замість карток із нулями, відповіді не запитуються", async () => {
    get.mockResolvedValue(adminForm());

    renderWorkspace("/forms/form-1/overview");

    expect(await screen.findByText("Готовність форми")).toBeInTheDocument();
    expect(screen.queryByText("Усього спроб")).not.toBeInTheDocument();
    expect(summary).not.toHaveBeenCalled();
    expect(responses).not.toHaveBeenCalled();
  });

  it("форма без питань: порожній стан і заблокована публікація", async () => {
    get.mockResolvedValue(adminForm({ questions: [] }));

    renderWorkspace("/forms/form-1/overview");

    expect(await screen.findByText("У цій формі ще немає питань")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Опублікувати" })).toBeDisabled();
  });

  it("не опублікована, але з відповідями - 'знято з публікації', а не чернетка", async () => {
    get.mockResolvedValue(adminForm({ isPublished: false, responseCount: 4 }));

    renderWorkspace("/forms/form-1/overview");

    expect((await screen.findAllByText("Знято з публікації")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Опублікувати знову" })).toBeEnabled();
  });

  it("опублікована форма без жодної активності: повідомлення з посиланням замість порожніх блоків", async () => {
    get.mockResolvedValue(adminForm({ isPublished: true, responseCount: 0 }));
    summary.mockResolvedValue({
      period: { from: null, to: null },
      current: totals({ responses: 0, started: 0, completed: 0, abandoned: 0, completionRate: 0 }),
      previous: null,
      daily: [],
    } as never);

    renderWorkspace("/forms/form-1/overview");

    expect(await screen.findByText("Ваша форма вже працює")).toBeInTheDocument();
  });

  it("збій одного блоку не валить сторінку: помилка з повтором, решта працює", async () => {
    get.mockResolvedValue(adminForm({ isPublished: true, responseCount: 9 }));
    funnel.mockRejectedValue(new Error("boom"));

    renderWorkspace("/forms/form-1/overview");

    expect((await screen.findAllByText("75.0%")).length).toBeGreaterThan(0);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Спробувати ще раз" })).toBeInTheDocument();
  });

  it("публікація викликає той самий API", async () => {
    get.mockResolvedValue(adminForm());
    publish.mockResolvedValue({ success: true } as never);

    renderWorkspace("/forms/form-1/overview");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Опублікувати" }));

    expect(publish).toHaveBeenCalledWith("form-1");
  });

  it("зміна назви й опису без білдера: зберігається з версією форми", async () => {
    get.mockResolvedValue(adminForm({ isPublished: true, responseCount: 9 }));
    update.mockResolvedValue({ success: true, version: 4 } as never);
    const user = userEvent.setup();

    renderWorkspace("/forms/form-1/overview");
    await user.click(await screen.findByRole("button", { name: "Змінити" }));

    const dialog = await screen.findByRole("dialog");
    const title = within(dialog).getByLabelText("Назва форми");
    await user.clear(title);
    await user.type(title, "Нова назва");
    await user.click(within(dialog).getByRole("button", { name: "Зберегти" }));

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![1]).toMatchObject({ title: "Нова назва", version: 3 });
  });

  it("порожня назва не зберігається", async () => {
    get.mockResolvedValue(adminForm({ isPublished: true, responseCount: 9 }));
    const user = userEvent.setup();

    renderWorkspace("/forms/form-1/overview");
    await user.click(await screen.findByRole("button", { name: "Змінити" }));
    const dialog = await screen.findByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Назва форми"));

    expect(within(dialog).getByRole("button", { name: "Зберегти" })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it("поширення: публічне посилання з shareId", async () => {
    get.mockResolvedValue(adminForm({ isPublished: true, responseCount: 9 }));
    const user = userEvent.setup();

    renderWorkspace("/forms/form-1/overview");
    await user.click((await screen.findAllByRole("button", { name: "Поділитися" }))[0]!);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByDisplayValue(/\/public\/forms\/share-1$/)).toBeInTheDocument();
  });

  it("видалення потребує підтвердження", async () => {
    get.mockResolvedValue(adminForm({ isPublished: true, responseCount: 9 }));
    const user = userEvent.setup();

    renderWorkspace("/forms/form-1/overview");
    await user.click(await screen.findByRole("button", { name: "Інші дії" }));
    await user.click(screen.getByRole("menuitem", { name: "Видалити форму" }));

    expect(formsApi.delete).not.toHaveBeenCalled();
    expect(await screen.findByText("Видалити цю форму?")).toBeInTheDocument();
  });
});
