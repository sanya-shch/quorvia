import { beforeEach, describe, expect, it, vi } from "vitest";
import { configure, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "../../components/ui/Toast";
import { formsApi } from "../../api/forms";
import { workspaceApi } from "../../api/workspaceApi";
import Dashboard from "./Dashboard";

// The suite runs many files in parallel: async lookups need more room than the 1 s default.
configure({ asyncUtilTimeout: 5000 });

vi.mock("../../api/forms", () => ({
  formsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    duplicate: vi.fn(),
  },
}));
vi.mock("../../api/workspaceApi", () => ({ workspaceApi: { getDashboardSummary: vi.fn() } }));

const form = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  title,
  description: `Опис ${title}`,
  shareId: `s-${id}`,
  isPublished: false,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  _count: { questions: 4, responses: 0 },
  ...over,
});

const forms = [
  form("a", "Альфа", {
    isPublished: true,
    _count: { questions: 8, responses: 624 },
    updatedAt: "2026-11-10T10:00:00.000Z",
  }),
  form("b", "Бета", { updatedAt: "2026-11-12T10:00:00.000Z" }),
  form("c", "Гамма", {
    isPublished: true,
    _count: { questions: 6, responses: 310 },
    updatedAt: "2026-11-05T10:00:00.000Z",
  }),
];

const totals = (o = {}) => ({
  responses: 20,
  started: 25,
  completed: 20,
  abandoned: 5,
  completionRate: 0.8,
  medianCompletionSeconds: null,
  ...o,
});

const renderDashboard = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/forms" element={<p>forms page</p>} />
            <Route path="/forms/:id/builder" element={<p>builder opened</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(formsApi.getAll).mockResolvedValue(forms as never);
  vi.mocked(workspaceApi.getDashboardSummary).mockResolvedValue({
    period: { from: null, to: null },
    forms: { total: 3, published: 2, createdInPeriod: 1 },
    current: totals(),
    previous: totals({ responses: 10, started: 20, completionRate: 0.6 }),
    daily: [
      { date: "2026-11-15", started: 3, submitted: 2 },
      { date: "2026-11-16", started: 4, submitted: 3 },
    ],
  } as never);
});

describe("Дашборд", () => {
  it("показники беруться з одного агрегованого запиту, зі зміною до попереднього періоду", async () => {
    renderDashboard();

    expect(await screen.findByText("80.0%")).toBeInTheDocument();
    expect(screen.getByText("Усього форм")).toBeInTheDocument();
    expect(screen.getByText(/\+100\.0%/)).toBeInTheDocument(); // 20 vs 10 responses
    expect(screen.getByText(/\+20\.0 в\.п\./)).toBeInTheDocument(); // 80% vs 60%
    expect(workspaceApi.getDashboardSummary).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    );
  });

  it("список форм: відсортований за оновленням, зі статусом, питаннями і відповідями", async () => {
    renderDashboard();

    const rows = within(await screen.findByRole("table"))
      .getAllByRole("row")
      .slice(1);
    expect(rows.map((row) => within(row).getAllByRole("link")[0]!.textContent)).toEqual([
      "Бета",
      "Альфа",
      "Гамма",
    ]);
    expect(within(rows[1]!).getByText("624")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Чернетка")).toBeInTheDocument();
  });

  it("фільтр 'Опубліковані' і пошук працюють разом", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("table");

    await user.click(screen.getByRole("tab", { name: /Опубліковані/ }));
    expect(within(screen.getByRole("table")).queryByText("Бета")).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "Гам");
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("Гамма")).toBeInTheDocument();
  });

  it("порожній результат пошуку каже про це", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("table");

    await user.type(screen.getByRole("searchbox"), "немає такої");

    expect(screen.getByText("Жодна форма не відповідає пошуку.")).toBeInTheDocument();
  });

  it("сортування за відповідями", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("table");

    await user.selectOptions(screen.getByLabelText("Сортування форм"), "responses");

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Альфа")).toBeInTheDocument();
  });

  it("створення форми відкриває білдер нової форми", async () => {
    vi.mocked(formsApi.create).mockResolvedValue(form("new", "Нова") as never);
    const user = userEvent.setup();
    renderDashboard();

    await user.click((await screen.findAllByRole("button", { name: /Створити форму/ }))[0]!);

    expect(await screen.findByText("builder opened")).toBeInTheDocument();
  });

  it("збій показників не ховає список форм", async () => {
    vi.mocked(workspaceApi.getDashboardSummary).mockRejectedValue(new Error("boom"));
    renderDashboard();

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
  });

  it("'Усі форми' веде на повний список", async () => {
    renderDashboard();

    expect(await screen.findByRole("link", { name: "Усі форми" })).toHaveAttribute(
      "href",
      "/forms",
    );
  });
});
