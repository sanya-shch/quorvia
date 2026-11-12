import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { QUOTA_LIMITS, type FormQuota } from "@quorvia/shared-types";
import type { Question } from "../../../types/formBuilder";
import { quotasApi } from "../../../api/quotasApi";
import { ToastProvider } from "../../../components/ui/Toast";
import QuotasEditor from "./QuotasEditor";

vi.mock("../../../api/quotasApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/quotasApi")>()),
  quotasApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    recount: vi.fn(),
  },
}));

const api = vi.mocked(quotasApi);

const question = (overrides: Partial<Question> = {}): Question => ({
  id: "q1",
  text: "Оцінка",
  type: "NUMBER",
  required: false,
  order: 0,
  options: [],
  config: null,
  ...overrides,
});

const quota = (overrides: Partial<FormQuota> = {}): FormQuota => ({
  id: "a",
  name: "Високі оцінки",
  condition: { logic: "AND", rules: [{ questionId: "q1", operator: "gt", value: 5 }] },
  limit: 50,
  count: 10,
  message: null,
  ...overrides,
});

const apiError = (status: number, message: string) =>
  new AxiosError("fail", "ERR", undefined, undefined, { status, data: { message } } as never);

const setup = (quotas: FormQuota[], questions: Question[] = [question()]) => {
  api.list.mockResolvedValue(quotas);

  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <QuotasEditor formId="form-1" questions={questions} />
      </ToastProvider>
    </QueryClientProvider>,
  );

  return userEvent.setup();
};

const card = (name: string) => screen.findByRole("group", { name });

describe("QuotasEditor", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  it("lists the quotas with how full they are", async () => {
    setup([quota(), quota({ id: "b", name: "Низькі", count: 50 })]);

    const open = await card("Високі оцінки");

    expect(within(open).getByText("10 з 50")).toBeInTheDocument();
    expect(within(open).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");
    expect(within(open).queryByText("Заповнена")).not.toBeInTheDocument();

    const full = await card("Низькі");

    expect(within(full).getByText("Заповнена")).toBeInTheDocument();
    expect(within(full).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("says when a quota went over its lowered limit", async () => {
    setup([quota({ count: 80, limit: 50 })]);

    expect(within(await card("Високі оцінки")).getByText("Понад ліміт")).toBeInTheDocument();
  });

  it("shows a failure to load the quotas", async () => {
    api.list.mockRejectedValue(apiError(500, "INTERNAL_SERVER_ERROR"));

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <QuotasEditor formId="form-1" questions={[question()]} />
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  describe("adding a quota", () => {
    it("cannot be saved until it is complete, then creates it", async () => {
      const user = setup([]);

      await user.click(await screen.findByRole("button", { name: "Додати квоту" }));
      const draft = screen.getByRole("group", { name: "Нова квота" });
      const save = within(draft).getByRole("button", { name: "Зберегти" });

      expect(save).toBeDisabled();
      expect(within(draft).getByText(/Заповніть значення кожної умови/)).toBeInTheDocument();

      await user.type(within(draft).getByLabelText("Назва"), "Київ");
      await user.type(within(draft).getByLabelText("Ліміт"), "30");
      fireEvent.change(within(draft).getByRole("spinbutton", { name: "" }), {
        target: { value: "7" },
      });
      await user.type(within(draft).getByLabelText(/Повідомлення для респондентів/), " Повно ");

      expect(save).toBeEnabled();

      api.create.mockResolvedValue(quota({ id: "new", name: "Київ", limit: 30, count: 0 }));
      api.list.mockResolvedValue([quota({ id: "new", name: "Київ", limit: 30, count: 0 })]);
      await user.click(save);

      await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
      expect(api.create).toHaveBeenCalledWith("form-1", {
        name: "Київ",
        limit: 30,
        message: "Повно",
        condition: { logic: "AND", rules: [{ questionId: "q1", operator: "equals", value: 7 }] },
      });
      // The saved quota replaces the draft.
      expect(await screen.findByText("0 з 30")).toBeInTheDocument();
      expect(screen.getAllByRole("group")).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Додати квоту" })).toBeEnabled();
    });

    it("only one new quota at a time, and it can be discarded", async () => {
      const user = setup([]);
      const add = await screen.findByRole("button", { name: "Додати квоту" });

      await user.click(add);
      expect(add).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Скасувати" }));
      expect(screen.queryByRole("group", { name: "Нова квота" })).not.toBeInTheDocument();
      expect(add).toBeEnabled();
      expect(api.create).not.toHaveBeenCalled();
    });

    it("cannot be added without a question that can be used, and says why", async () => {
      setup([], [question({ type: "RANKING" }), question({ id: undefined, type: "TEXT" })]);

      expect(await screen.findByRole("button", { name: "Додати квоту" })).toBeDisabled();
      expect(
        screen.getByText(/Збережіть питання, яке можна використати в умовах/),
      ).toBeInTheDocument();
    });

    it("cannot be added past the limit", async () => {
      setup(
        Array.from({ length: QUOTA_LIMITS.perForm }, (_, i) =>
          quota({ id: `q${i}`, name: `Квота ${i}` }),
        ),
      );

      // Once the quotas are loaded: before that the list is empty and the button is enabled.
      expect(
        await screen.findByText(`Не більше ${QUOTA_LIMITS.perForm} квот.`),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Додати квоту" })).toBeDisabled();
    });

    it("tells the author what the server refused", async () => {
      const user = setup([]);

      await user.click(await screen.findByRole("button", { name: "Додати квоту" }));
      const draft = screen.getByRole("group", { name: "Нова квота" });

      await user.type(within(draft).getByLabelText("Назва"), "Київ");
      await user.type(within(draft).getByLabelText("Ліміт"), "30");
      fireEvent.change(within(draft).getByRole("spinbutton", { name: "" }), {
        target: { value: "7" },
      });
      api.create.mockRejectedValue(apiError(409, "QUOTA_LIMIT_REACHED"));
      await user.click(within(draft).getByRole("button", { name: "Зберегти" }));

      expect(await screen.findByText(/максимальна кількість квот/)).toBeInTheDocument();
      // The draft is kept: nothing the author typed is lost (the card is named after the quota).
      expect(screen.getByRole("group", { name: "Київ" })).toBeInTheDocument();
      expect(screen.getByLabelText("Ліміт")).toHaveValue(30);
    });
  });

  describe("changing a quota", () => {
    it("sends only the name when only the name changed", async () => {
      const user = setup([quota()]);
      const open = await card("Високі оцінки");
      const save = within(open).getByRole("button", { name: "Зберегти" });

      expect(save).toBeDisabled();

      await user.type(within(open).getByLabelText("Назва"), " 2");
      api.update.mockResolvedValue(quota({ name: "Високі оцінки 2" }));
      await user.click(save);

      await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
      expect(api.update).toHaveBeenCalledWith("form-1", "a", { name: "Високі оцінки 2" });
    });

    it("warns that a different condition counts the responses again, and sends it", async () => {
      const user = setup([quota()]);
      const open = await card("Високі оцінки");

      expect(within(open).queryByText(/перерахує відповіді заново/)).not.toBeInTheDocument();

      fireEvent.change(within(open).getByRole("spinbutton", { name: "" }), {
        target: { value: "8" },
      });

      expect(within(open).getByText(/перерахує відповіді заново/)).toBeInTheDocument();

      api.update.mockResolvedValue(quota());
      await user.click(within(open).getByRole("button", { name: "Зберегти" }));

      await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
      expect(api.update.mock.calls[0]![2]).toEqual({
        condition: { logic: "AND", rules: [{ questionId: "q1", operator: "gt", value: 8 }] },
      });
    });

    it("keeps the unsaved edits of one quota when another one is saved", async () => {
      const user = setup([quota(), quota({ id: "b", name: "Друга" })]);
      const first = await card("Високі оцінки");

      await user.type(within(first).getByLabelText("Назва"), "!");
      api.update.mockResolvedValue(quota({ id: "b", name: "Друга!" }));
      api.list.mockResolvedValue([quota(), quota({ id: "b", name: "Друга!" })]);
      const second = await card("Друга");

      await user.type(within(second).getByLabelText("Назва"), "!");
      await user.click(within(second).getByRole("button", { name: "Зберегти" }));

      await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
      expect(await card("Високі оцінки!")).toBeInTheDocument();
    });

    it("refuses an invalid limit in the form, before asking the server", async () => {
      const user = setup([quota()]);
      const open = await card("Високі оцінки");

      await user.clear(within(open).getByLabelText("Ліміт"));
      await user.type(within(open).getByLabelText("Ліміт"), "0");

      expect(within(open).getByRole("button", { name: "Зберегти" })).toBeDisabled();
    });
  });

  describe("recounting and deleting", () => {
    it("counts again on request", async () => {
      const user = setup([quota()]);
      const open = await card("Високі оцінки");

      api.recount.mockResolvedValue(quota({ count: 12 }));
      api.list.mockResolvedValue([quota({ count: 12 })]);
      await user.click(within(open).getByRole("button", { name: "Перерахувати" }));

      await waitFor(() => expect(api.recount).toHaveBeenCalledWith("form-1", "a"));
      expect(await screen.findByText("12 з 50")).toBeInTheDocument();
    });

    it("asks before deleting, and deletes only when confirmed", async () => {
      const user = setup([quota()]);
      const open = await card("Високі оцінки");

      await user.click(within(open).getByRole("button", { name: "Видалити" }));

      const dialog = screen.getByRole("dialog");

      expect(dialog).toHaveTextContent("Видалити квоту «Високі оцінки»?");

      await user.click(within(dialog).getByRole("button", { name: "Скасувати" }));
      expect(api.remove).not.toHaveBeenCalled();

      await user.click(within(open).getByRole("button", { name: "Видалити" }));
      api.remove.mockResolvedValue(undefined);
      api.list.mockResolvedValue([]);
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Видалити" }),
      );

      await waitFor(() => expect(api.remove).toHaveBeenCalledWith("form-1", "a"));
      await waitFor(() =>
        expect(screen.queryByRole("group", { name: "Високі оцінки" })).not.toBeInTheDocument(),
      );
    });
  });

  it("flags a quota whose question was deleted, as the server would refuse to save the form", async () => {
    setup([
      quota({
        condition: { logic: "AND", rules: [{ questionId: "gone", operator: "gt", value: 1 }] },
      }),
    ]);

    expect(
      within(await card("Високі оцінки")).getByText(/посилається на питання, яке видалено/),
    ).toBeInTheDocument();
  });
});
