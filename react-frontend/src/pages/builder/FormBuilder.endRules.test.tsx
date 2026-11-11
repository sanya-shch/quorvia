import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AxiosError } from "axios";
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

const mockedGet = vi.mocked(formsApi.getAdminForm);
const mockedUpdate = vi.mocked(formsApi.update);

const score = {
  id: "q1",
  text: "Оцінка",
  type: "NUMBER" as const,
  required: false,
  order: 0,
  options: [],
  config: null,
};

const rule = (id: string, overrides: Partial<FormEndRule> = {}): FormEndRule => ({
  id,
  condition: { logic: "AND", rules: [{ questionId: "q1", operator: "gt", value: 5 }] },
  screen: { text: `Текст ${id}`, redirectUrl: "" },
  ...overrides,
});

const adminForm = (overrides: Partial<AdminForm> = {}): AdminForm => ({
  title: "Початкова",
  description: "",
  responseMode: "ALL_AT_ONCE",
  version: 1,
  questions: [score],
  ...overrides,
});

const apiError = (status: number, message: string) =>
  new AxiosError("fail", "ERR", undefined, undefined, { status, data: { message } } as never);

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

const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole("button", { name: "Зберегти форму" }));

describe("FormBuilder - end rules", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedUpdate.mockResolvedValue({ success: true, version: 2 });
  });

  it("loads the saved rules into the editor", async () => {
    mockedGet.mockResolvedValue(adminForm({ endRules: [rule("a"), rule("b")] }));
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    expect(screen.getByRole("group", { name: "Правило 1" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Текст b")).toBeInTheDocument();
  });

  it("sends a rule the author added once it is finished", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(adminForm());
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.click(screen.getByRole("button", { name: "Додати правило" }));
    const card = screen.getByRole("group", { name: "Правило 1" });

    await user.type(card.querySelector("input[type=number]")!, "8");
    await user.type(card.querySelector("textarea")!, "Чудово!");
    await save(user);

    expect(mockedUpdate).toHaveBeenCalledTimes(1);

    const sent = mockedUpdate.mock.calls[0]![1].endRules!;

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      condition: { logic: "AND", rules: [{ questionId: "q1", value: 8 }] },
      screen: { text: "Чудово!" },
    });
  });

  it("does not send a rule that is not finished", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(
      adminForm({ endRules: [rule("a"), rule("b", { screen: { text: "" } })] }),
    );
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.type(screen.getByDisplayValue("Початкова"), "!");
    await save(user);

    expect(mockedUpdate.mock.calls[0]![1].endRules!.map((r) => r.id)).toEqual(["a"]);
  });

  it("sends null when every rule was removed, so the server removes them", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(adminForm({ endRules: [rule("a")] }));
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.click(screen.getByRole("button", { name: "Видалити правило" }));
    await save(user);

    expect(mockedUpdate.mock.calls[0]![1]).toMatchObject({ endRules: null });
  });

  it("keeps the order of the rules the author set", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(adminForm({ endRules: [rule("a"), rule("b")] }));
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    // "Up" of the second rule (the first one's is disabled).
    await user.click(screen.getAllByRole("button", { name: "Вище" })[1]!);
    await save(user);

    expect(mockedUpdate.mock.calls[0]![1].endRules!.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("does not save while a rule looks at a deleted question", async () => {
    const user = userEvent.setup();
    const broken = rule("a", {
      condition: { logic: "AND", rules: [{ questionId: "gone", operator: "gt", value: 1 }] },
    });
    mockedGet.mockResolvedValue(adminForm({ endRules: [broken] }));
    renderBuilder();
    // An edit makes the form saveable; the broken rule is what must stop it.
    await user.type(await screen.findByDisplayValue("Початкова"), "!");

    await save(user);

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/посилається на питання, яке видалено/)).toBeInTheDocument();
  });

  it("tells the author when the server refuses the rules", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(adminForm({ endRules: [rule("a")] }));
    mockedUpdate.mockRejectedValue(apiError(400, "FORM_INVALID_END_RULES"));
    renderBuilder();
    // Saving needs an edit: an untouched form has nothing to save.
    await user.type(await screen.findByDisplayValue("Початкова"), "!");

    await save(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Правило результату посилається на питання/,
    );
  });
});
