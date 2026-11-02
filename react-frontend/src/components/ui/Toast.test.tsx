import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./Toast";
import { playToastAnimation } from "./toastMotion";

// Самі анімації (WAAPI) у jsdom недоступні: життєвий цикл повідомлення
// перевіряємо з керованою моєю, а toastMotion.ts - окремим тестом.
vi.mock("./toastMotion", () => ({ playToastAnimation: vi.fn() }));
const mockedPlay = vi.mocked(playToastAnimation);

/** Хук рендериться всередині провайдера; самі повідомлення видно через screen. */
let api: ReturnType<typeof useToast>;

const setup = () => {
  const { result } = renderHook(() => useToast(), { wrapper: ToastProvider });
  api = result.current;
};

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedPlay.mockReset();
    mockedPlay.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("успіх показується з role=status, помилка - з role=alert (різні ARIA-оголошення)", () => {
    setup();

    act(() => {
      api.success("Збережено");
      api.error("Не вдалося");
    });

    expect(screen.getByRole("status")).toHaveTextContent("Збережено");
    expect(screen.getByRole("alert")).toHaveTextContent("Не вдалося");
  });

  // Зникнення - це exit-анімація motion, яка завершується асинхронно (на кадрі),
  // тому "зникло" перевіряємо через waitFor. У тестах анімації миттєві
  // (MotionGlobalConfig.skipAnimations у test/setup.ts).
  it("успіх зникає через 4 с", async () => {
    setup();
    act(() => api.success("Збережено"));

    act(() => vi.advanceTimersByTime(3900));
    expect(screen.getByText("Збережено")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(200));
    await waitFor(() => expect(screen.queryByText("Збережено")).not.toBeInTheDocument());
  });

  it("помилка висить довше за успіх (8 с), щоб її встигли прочитати", async () => {
    setup();
    act(() => api.error("Не вдалося"));

    act(() => vi.advanceTimersByTime(7900));
    expect(screen.getByText("Не вдалося")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(200));
    await waitFor(() => expect(screen.queryByText("Не вдалося")).not.toBeInTheDocument());
  });

  it("кнопка «Закрити» прибирає повідомлення одразу", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup();
    act(() => api.success("Збережено"));

    await user.click(screen.getByRole("button", { name: "Закрити" }));

    await waitFor(() => expect(screen.queryByText("Збережено")).not.toBeInTheDocument());
  });

  it("закриття одного повідомлення не зачіпає інші", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup();
    act(() => {
      api.success("Перше");
      api.success("Друге");
    });

    await user.click(screen.getAllByRole("button", { name: "Закрити" })[0]);

    await waitFor(() => expect(screen.queryByText("Перше")).not.toBeInTheDocument());
    expect(screen.getByText("Друге")).toBeInTheDocument();
  });

  it("показує щонайбільше 4 повідомлень, найстаріші витісняються", async () => {
    setup();

    act(() => {
      for (let i = 1; i <= 6; i++) api.success(`Повідомлення ${i}`);
    });

    await waitFor(() => expect(screen.getAllByRole("status")).toHaveLength(4));
    expect(screen.queryByText("Повідомлення 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Повідомлення 2")).not.toBeInTheDocument();
    expect(screen.getByText("Повідомлення 6")).toBeInTheDocument();
  });

  it("витіснене повідомлення не ламає таймери решти", async () => {
    setup();
    act(() => {
      for (let i = 1; i <= 5; i++) api.success(`№${i}`);
    });

    expect(() => act(() => vi.advanceTimersByTime(5000))).not.toThrow();
    await waitFor(() => expect(screen.queryAllByRole("status")).toHaveLength(0));
  });

  it("useToast поза провайдером дає зрозумілу помилку", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const Orphan = () => {
      useToast();
      return null;
    };

    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });

  describe("анімація появи й зникнення", () => {
    it("при появі програє анімацію входу на елементі повідомлення", () => {
      setup();

      act(() => api.success("Збережено"));

      expect(mockedPlay).toHaveBeenCalledWith(screen.getByRole("status"), "enter");
    });

    it("при закритті спершу програє вихід, а з DOM прибирає лише ПІСЛЯ його завершення", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      let finishExit!: () => void;
      mockedPlay.mockImplementation((_el, phase) =>
        phase === "exit" ? new Promise<void>((resolve) => (finishExit = resolve)) : Promise.resolve(),
      );
      setup();
      act(() => api.success("Збережено"));

      await user.click(screen.getByRole("button", { name: "Закрити" }));

      expect(mockedPlay).toHaveBeenCalledWith(screen.getByRole("status"), "exit");
      expect(screen.getByText("Збережено")).toBeInTheDocument(); // анімація ще йде
      expect(screen.getByRole("status")).toHaveClass("pointer-events-none"); // але натискати вже не можна

      await act(async () => finishExit());

      await waitFor(() => expect(screen.queryByText("Збережено")).not.toBeInTheDocument());
    });

    it("автозакриття теж іде через анімацію виходу", async () => {
      let finishExit!: () => void;
      mockedPlay.mockImplementation((_el, phase) =>
        phase === "exit" ? new Promise<void>((resolve) => (finishExit = resolve)) : Promise.resolve(),
      );
      setup();
      act(() => api.success("Збережено"));

      act(() => vi.advanceTimersByTime(4100));

      expect(mockedPlay).toHaveBeenCalledWith(expect.anything(), "exit");
      expect(screen.getByText("Збережено")).toBeInTheDocument();

      await act(async () => finishExit());
      await waitFor(() => expect(screen.queryByText("Збережено")).not.toBeInTheDocument());
    });

    it("клік по «Закрити» і таймер одночасно не запускають вихід двічі", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockedPlay.mockImplementation((_el, phase) =>
        phase === "exit" ? new Promise<void>(() => {}) : Promise.resolve(),
      );
      setup();
      act(() => api.success("Збережено"));

      await user.click(screen.getByRole("button", { name: "Закрити" }));
      act(() => vi.advanceTimersByTime(10_000));

      const exits = mockedPlay.mock.calls.filter(([, phase]) => phase === "exit");
      expect(exits).toHaveLength(1);
    });

    it("витіснене (понад 4) повідомлення зникає одразу, без очікування анімації", () => {
      mockedPlay.mockImplementation(() => new Promise<void>(() => {})); // жодна анімація не завершується
      setup();

      act(() => {
        for (let i = 1; i <= 5; i++) api.success(`№${i}`);
      });

      expect(screen.queryByText("№1")).not.toBeInTheDocument();
      expect(screen.getAllByRole("status")).toHaveLength(4);
    });
  });
});
