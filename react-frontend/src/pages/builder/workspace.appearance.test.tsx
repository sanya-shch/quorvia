import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWorkspace } from "../workspace/renderWorkspace";
import { formsApi } from "../../api/forms";
import type { AdminForm } from "../../types/formBuilder";

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

vi.mock("../viewer/theme/fonts", () => ({
  useThemeFont: () => undefined,
  loadFont: () => Promise.resolve(),
}));

// The workspace sections are lazy chunks: the first render in jsdom is slow.
vi.setConfig({ testTimeout: 20000 });

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

const renderBuilder = () => renderWorkspace("/forms/form-1/settings");

const save = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole("button", { name: "Зберегти" }));

describe("Form workspace - appearance", () => {
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
  }, 10000);

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

  it("loads the saved closing settings and the number of responses", async () => {
    mockedGet.mockResolvedValue(adminForm({ maxResponses: 50, responseCount: 12 }));
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    expect(screen.getByLabelText("Максимальна кількість відповідей")).toHaveValue(50);
    expect(screen.getByText("Зібрано: 12 з 50")).toBeInTheDocument();
  });

  it("sends the closing limits the author set", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(adminForm());
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.type(screen.getByLabelText("Максимальна кількість відповідей"), "30");
    fireEvent.change(screen.getByLabelText("Закрити"), { target: { value: "2030-06-15T10:30" } });
    await save(user);

    const payload = mockedUpdate.mock.calls[0]![1];

    expect(payload.maxResponses).toBe(30);
    expect(payload.closesAt).toMatch(/^2030-06-15T\d{2}:\d{2}:00\.000Z$/);
  });

  it("sends null for a limit the author removed, so the server clears it", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(
      adminForm({ maxResponses: 50, closesAt: "2030-06-15T10:30:00.000Z" }),
    );
    renderBuilder();
    await screen.findByDisplayValue("Початкова");

    await user.clear(screen.getByLabelText("Максимальна кількість відповідей"));
    fireEvent.change(screen.getByLabelText("Закрити"), { target: { value: "" } });
    await save(user);

    expect(mockedUpdate.mock.calls[0]![1]).toMatchObject({ maxResponses: null, closesAt: null });
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
