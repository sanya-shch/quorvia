import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { FormEndRule } from "@quorvia/shared-types";
import FormBuilder from "./FormBuilder";
import { formsApi } from "../../api/forms";
import { ToastProvider } from "../../components/ui/Toast";
import type { AdminForm } from "../../types/formBuilder";

vi.mock("../../api/forms", () => ({
  formsApi: { getAdminForm: vi.fn(), update: vi.fn() },
}));

vi.mock("../viewer/theme/fonts", () => ({
  useThemeFont: () => undefined,
  loadFont: () => Promise.resolve(),
}));

vi.mock("../../api/quotasApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/quotasApi")>()),
  quotasApi: { list: vi.fn().mockResolvedValue([]) },
}));

const mockedGet = vi.mocked(formsApi.getAdminForm);
const mockedUpdate = vi.mocked(formsApi.update);

const choice = {
  id: "q1",
  text: "Рівень",
  type: "CHOICE_SINGLE" as const,
  required: false,
  order: 0,
  options: [
    { id: "pro", text: "Профі" },
    { id: "new", text: "Новачок" },
  ],
  config: null,
};

const number = (config: Record<string, unknown>) => ({
  id: "q2",
  text: "Стаж",
  type: "NUMBER" as const,
  required: false,
  order: 1,
  options: [],
  config,
});

const adminForm = (overrides: Partial<AdminForm> = {}): AdminForm => ({
  title: "Початкова",
  description: "",
  responseMode: "ALL_AT_ONCE",
  version: 1,
  questions: [choice],
  ...overrides,
});

const renderBuilder = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <MemoryRouter initialEntries={["/forms/form-1/edit"]}>
          <Routes>
            <Route path="/forms/:formId/edit" element={<FormBuilder />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

// Saving needs an edit: an untouched form has nothing to save.
const edit = async (user: ReturnType<typeof userEvent.setup>) =>
  user.type(await screen.findByDisplayValue("Початкова"), "!");

const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole("button", { name: "Зберегти форму" }));

const sent = () => mockedUpdate.mock.calls[0]![1];

describe("FormBuilder - scoring", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedUpdate.mockResolvedValue({ success: true, version: 2 });
  });

  it("loads the saved settings into the editor", async () => {
    mockedGet.mockResolvedValue(
      adminForm({
        scoring: {
          enabled: true,
          categories: [{ id: "a", label: "Початківець", min: 0, max: 30.5 }],
        },
      }),
    );
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    expect(screen.getByRole("checkbox", { name: "Рахувати бали за відповіді" })).toBeChecked();

    const group = screen.getByRole("group", { name: "Початківець" });

    expect(within(group).getByLabelText("Від")).toHaveValue("0");
    expect(within(group).getByLabelText("До")).toHaveValue("30.5");
  });

  it("shows the points of a question only while scoring is on", async () => {
    const user = userEvent.setup();

    mockedGet.mockResolvedValue(adminForm());
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    expect(screen.queryByLabelText("Бали за «Профі»")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Рахувати бали за відповіді" }));

    expect(screen.getByLabelText("Бали за «Профі»")).toBeInTheDocument();
  });

  it("sends the points the author gave and the finished categories", async () => {
    const user = userEvent.setup();

    mockedGet.mockResolvedValue(adminForm());
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.click(screen.getByRole("checkbox", { name: "Рахувати бали за відповіді" }));
    await user.type(screen.getByLabelText("Бали за «Профі»"), "6");
    await user.click(screen.getByRole("button", { name: "Додати категорію" }));

    const category = screen.getAllByRole("group", { name: "Нова категорія" })[0]!;

    await user.type(within(category).getByLabelText("Назва"), "Експерт");
    await user.type(within(category).getByLabelText("Від"), "5");
    await user.type(within(category).getByLabelText("До"), "10");
    // A second category that is not finished is not saved.
    await user.click(screen.getByRole("button", { name: "Додати категорію" }));

    await edit(user);
    await save(user);

    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(sent().questions[0]!.options[0]).toMatchObject({ id: "pro", score: 6 });
    expect(sent().questions[0]!.options[1]).not.toHaveProperty("score");
    expect(sent().scoring).toMatchObject({
      enabled: true,
      categories: [expect.objectContaining({ label: "Експерт", min: 5, max: 10 })],
    });
    expect(sent().scoring!.categories).toHaveLength(1);
  });

  it("sends null when scoring is off and has no categories, so the server removes it", async () => {
    const user = userEvent.setup();

    mockedGet.mockResolvedValue(adminForm({ scoring: { enabled: true, categories: [] } }));
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.click(screen.getByRole("checkbox", { name: "Рахувати бали за відповіді" }));
    await edit(user);
    await save(user);

    expect(sent().scoring).toBeNull();
  });

  it("does not save while categories overlap, and says so", async () => {
    const user = userEvent.setup();

    // The server never sends overlapping categories (they are dropped on load), so the overlap is
    // made in the editor.
    mockedGet.mockResolvedValue(
      adminForm({
        scoring: {
          enabled: true,
          categories: [
            { id: "a", label: "A", min: 0, max: 10 },
            { id: "b", label: "B", min: 11, max: 15 },
          ],
        },
      }),
    );
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    fireEvent.change(within(screen.getByRole("group", { name: "B" })).getByLabelText("Від"), {
      target: { value: "5" },
    });
    await edit(user);

    await save(user);

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/Виправте категорії результату/)).toBeInTheDocument();
  });

  it("does not save a scored number that has no range, and says which question", async () => {
    const user = userEvent.setup();

    mockedGet.mockResolvedValue(
      adminForm({
        questions: [number({ scoreMultiplier: 2 })],
        scoring: { enabled: true, categories: [] },
      }),
    );
    renderBuilder();
    await edit(user);

    await save(user);

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(screen.getAllByText(/задайте і мінімум, і максимум/).length).toBeGreaterThan(0);
  });

  it("saves the number once it has a range", async () => {
    const user = userEvent.setup();

    mockedGet.mockResolvedValue(
      adminForm({
        questions: [number({ scoreMultiplier: 2, min: 0, max: 10 })],
        scoring: { enabled: true, categories: [] },
      }),
    );
    renderBuilder();
    await edit(user);

    await save(user);

    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(sent().questions[0]!.config).toMatchObject({ scoreMultiplier: 2, min: 0, max: 10 });
  });

  it("does not save a rule on the score while scoring is off", async () => {
    const user = userEvent.setup();
    const onScore: FormEndRule = {
      id: "r",
      condition: { logic: "AND", rules: [{ questionId: "$score", operator: "gt", value: 5 }] },
      screen: { text: "Супер" },
    };

    mockedGet.mockResolvedValue(adminForm({ endRules: [onScore] }));
    renderBuilder();
    await edit(user);

    await save(user);

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/посилається на питання, яке видалено/)).toBeInTheDocument();
  });

  it("saves a rule on the score once scoring is on", async () => {
    const user = userEvent.setup();
    const onScore: FormEndRule = {
      id: "r",
      condition: { logic: "AND", rules: [{ questionId: "$score", operator: "gt", value: 5 }] },
      screen: { text: "Супер {{score}}" },
    };

    mockedGet.mockResolvedValue(
      adminForm({ endRules: [onScore], scoring: { enabled: true, categories: [] } }),
    );
    renderBuilder();
    await edit(user);

    await save(user);

    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(sent().endRules![0]!.condition.rules[0]!.questionId).toBe("$score");
  });

  it("keeps the order of the text typed into a point field (decimals, a minus sign)", async () => {
    const user = userEvent.setup();

    mockedGet.mockResolvedValue(adminForm({ scoring: { enabled: true, categories: [] } }));
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    const field = screen.getByLabelText("Бали за «Профі»");

    await user.type(field, "-2,5");

    expect(field).toHaveValue("-2,5");

    await edit(user);
    await save(user);

    expect(sent().questions[0]!.options[0]).toMatchObject({ score: -2.5 });
  });

  it("an invalid value in a point field is not sent", async () => {
    const user = userEvent.setup();

    mockedGet.mockResolvedValue(adminForm({ scoring: { enabled: true, categories: [] } }));
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    fireEvent.change(screen.getByLabelText("Бали за «Профі»"), { target: { value: "99999" } });
    await edit(user);
    await save(user);

    expect(sent().questions[0]!.options[0]).not.toHaveProperty("score");
  });
});
