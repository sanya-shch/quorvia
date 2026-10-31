import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AxiosError } from "axios";
import FormBuilder from "./FormBuilder";
import { formsApi } from "../../api/forms";
import type { AdminForm } from "../../types/formBuilder";

vi.mock("../../api/forms", () => ({
  formsApi: {
    getAdminForm: vi.fn(),
    update: vi.fn(),
  },
}));

const mockedGet = vi.mocked(formsApi.getAdminForm);
const mockedUpdate = vi.mocked(formsApi.update);

const adminForm = (overrides: Partial<AdminForm> = {}): AdminForm => ({
  title: "Початкова",
  description: "",
  responseMode: "ALL_AT_ONCE",
  version: 3,
  questions: [
    {
      id: "q1",
      order: 0,
      type: "TEXT",
      text: "Перше питання",
      required: false,
      options: [],
      config: null,
    } as AdminForm["questions"][number],
  ],
  ...overrides,
});

const apiError = (status: number, message: string) =>
  new AxiosError("fail", "ERR", undefined, undefined, {
    status,
    data: { message },
  } as never);

const renderBuilder = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/forms/form-1/edit"]}>
        <Routes>
          <Route path="/forms/:formId/edit" element={<FormBuilder />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

type User = ReturnType<typeof userEvent.setup>;

/** Кнопка "Зберегти" активна лише для "брудної" форми - тож спершу правимо назву. */
const editTitleAndSave = async (user: User, currentTitle: string) => {
  await user.type(await screen.findByDisplayValue(currentTitle), "!");
  await user.click(await screen.findByRole("button", { name: "Зберегти форму" }));
};

describe("FormBuilder - optimistic locking (version)", () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedGet.mockResolvedValue(adminForm());
    alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("шле на збереження версію, яку завантажив, а наступне збереження - ту, що повернув сервер", async () => {
    const user = userEvent.setup();
    mockedUpdate.mockResolvedValueOnce({ success: true, version: 4 });
    mockedUpdate.mockResolvedValueOnce({ success: true, version: 5 });
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await editTitleAndSave(user, "Початкова");
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][1]).toMatchObject({ title: "Початкова!", version: 3 });

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1)); // saveSuccess
    await editTitleAndSave(user, "Початкова!");
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2));
    expect(mockedUpdate.mock.calls[1][1]).toMatchObject({ version: 4 });
  });

  it("409 FORM_VERSION_CONFLICT відкриває діалог конфлікту, а не загальний alert про помилку", async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValueOnce(apiError(409, "FORM_VERSION_CONFLICT"));
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await editTitleAndSave(user, "Початкова");

    expect(await screen.findByText("Форму змінили в іншому місці")).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("«Завантажити актуальну» підтягує свіжу форму і наступне збереження йде з її версією", async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValueOnce(apiError(409, "FORM_VERSION_CONFLICT"));
    mockedUpdate.mockResolvedValueOnce({ success: true, version: 8 });
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await editTitleAndSave(user, "Початкова");
    await screen.findByText("Форму змінили в іншому місці");

    mockedGet.mockResolvedValue(adminForm({ title: "З іншої вкладки", version: 7 }));
    await user.click(screen.getByRole("button", { name: "Завантажити актуальну" }));

    expect(await screen.findByDisplayValue("З іншої вкладки")).toBeInTheDocument();
    expect(screen.queryByText("Форму змінили в іншому місці")).not.toBeInTheDocument();

    await editTitleAndSave(user, "З іншої вкладки");
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2));
    expect(mockedUpdate.mock.calls[1][1]).toMatchObject({ title: "З іншої вкладки!", version: 7 });
  });

  it("інша помилка збереження - загальний alert, діалог конфлікту не відкривається", async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValueOnce(apiError(500, "UNKNOWN"));
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await editTitleAndSave(user, "Початкова");

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Форму змінили в іншому місці")).not.toBeInTheDocument();
  });
});
