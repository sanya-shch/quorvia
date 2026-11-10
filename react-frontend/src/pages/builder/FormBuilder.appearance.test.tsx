import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

const adminForm = (overrides: Partial<AdminForm> = {}): AdminForm => ({
  title: "Початкова",
  description: "",
  responseMode: "ALL_AT_ONCE",
  version: 1,
  questions: [],
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

const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole("button", { name: "Зберегти форму" }));

describe("FormBuilder - appearance", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedUpdate.mockResolvedValue({ success: true, version: 2 });
  });

  it("loads the saved theme and logo into the editor", async () => {
    mockedGet.mockResolvedValue(
      adminForm({ theme: { mode: "dark", radius: "large" }, logoAssetId: "asset-1" }),
    );
    renderBuilder();

    await screen.findByDisplayValue("Початкова");

    expect(screen.getByRole("button", { name: "Темна" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Великі" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Замінити" })).toBeInTheDocument();
  });

  it("sends a changed theme on save", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(adminForm());
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.click(screen.getByRole("button", { name: "Темна" }));
    await user.click(screen.getByRole("button", { name: "Малі" }));
    await save(user);

    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(mockedUpdate.mock.calls[0]![1]).toMatchObject({
      theme: { mode: "dark", radius: "small" },
    });
  });

  it("sends null when the theme was reset, so the server removes it", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(adminForm({ theme: { mode: "dark" } }));
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.click(screen.getByRole("button", { name: "Скинути оформлення до типового" }));
    await save(user);

    expect(mockedUpdate.mock.calls[0]![1]).toMatchObject({ theme: null });
  });

  it("sends the screens the author set up", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(adminForm());
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.click(screen.getByRole("checkbox", { name: /привітальний екран/i }));
    await user.click(screen.getByRole("checkbox", { name: /власне повідомлення/i }));
    await user.type(screen.getByLabelText("Повідомлення"), "Дякуємо!");
    await user.type(screen.getByLabelText(/Адреса для переходу/), "https://example.com/next");
    await save(user);

    expect(mockedUpdate.mock.calls[0]![1]).toMatchObject({
      welcomeScreen: { title: "Початкова" },
      endScreen: { text: "Дякуємо!", redirectUrl: "https://example.com/next" },
    });
  });

  it("does not save an incomplete screen or a redirect that is not http(s)", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(adminForm());
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.click(screen.getByRole("checkbox", { name: /привітальний екран/i }));
    await user.clear(screen.getByLabelText("Заголовок"));
    await user.click(screen.getByRole("checkbox", { name: /власне повідомлення/i }));
    await user.type(screen.getByLabelText("Повідомлення"), "Дякуємо!");
    await user.type(screen.getByLabelText(/Адреса для переходу/), "javascript:alert(1)");
    await save(user);

    const payload = mockedUpdate.mock.calls[0]![1];

    expect(payload.welcomeScreen).toBeNull();
    expect(payload.endScreen).toEqual({ text: "Дякуємо!" });
  });

  it("loads saved screens into the editor and removes one with null", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(
      adminForm({ welcomeScreen: { title: "Вітаємо" }, endScreen: { text: "Дякуємо" } }),
    );
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    expect(screen.getByLabelText("Заголовок")).toHaveValue("Вітаємо");

    await user.click(screen.getByRole("checkbox", { name: /привітальний екран/i }));
    await save(user);

    expect(mockedUpdate.mock.calls[0]![1]).toMatchObject({
      welcomeScreen: null,
      endScreen: { text: "Дякуємо" },
    });
  });

  it("sends the logo when it is removed", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(adminForm({ logoAssetId: "asset-1" }));
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.click(screen.getByRole("button", { name: "Видалити" }));
    await save(user);

    expect(mockedUpdate.mock.calls[0]![1]).toMatchObject({ logoAssetId: null });
  });
});
