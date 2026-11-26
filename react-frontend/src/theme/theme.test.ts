import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  followSystemTheme,
  getTheme,
  readStoredTheme,
  setTheme,
  subscribeTheme,
} from "./theme";

const root = document.documentElement;

interface MediaState {
  dark?: boolean;
  reduced?: boolean;
}

// matchMedia answers per query from `media`; the "change" listener is kept so a test can fire it.
const media = { dark: false, reduced: false };
let changeListener: (() => void) | null = null;

const stubMedia = ({ dark = false, reduced = false }: MediaState = {}) => {
  media.dark = dark;
  media.reduced = reduced;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("dark") ? media.dark : query.includes("reduce") ? media.reduced : false,
    addEventListener: (_: string, listener: () => void) => (changeListener = listener),
    removeEventListener: vi.fn(),
  }));
};

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete root.dataset.theme;
    changeListener = null;
    stubMedia();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (document as unknown as Record<string, unknown>).startViewTransition;
    delete (root as unknown as Record<string, unknown>).animate;
  });

  describe("getTheme", () => {
    it("без вибору й атрибута береться системна тема", () => {
      expect(getTheme()).toBe("light");

      stubMedia({ dark: true });
      expect(getTheme()).toBe("dark");
    });

    it("вибір людини сильніший за системну тему", () => {
      stubMedia({ dark: true });
      localStorage.setItem(THEME_STORAGE_KEY, "light");

      expect(readStoredTheme()).toBe("light");
      expect(getTheme()).toBe("light");
    });

    it("атрибут <html data-theme> (його ставить скрипт до першого кадру) сильніший за все", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      root.dataset.theme = "dark";

      expect(getTheme()).toBe("dark");
    });

    it("сміття у сховищі ігнорується", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "purple");

      expect(readStoredTheme()).toBeNull();
      expect(getTheme()).toBe("light");
    });
  });

  describe("setTheme без переходу", () => {
    it("зберігає вибір, ставить атрибут і повідомляє підписників", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeTheme(listener);

      setTheme("dark");

      expect(root.dataset.theme).toBe("dark");
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      setTheme("light");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("оновлює колір браузера на мобільному (theme-color)", () => {
      document.head.insertAdjacentHTML(
        "beforeend",
        '<meta name="theme-color" content="#4f46e5" />',
      );

      setTheme("dark");
      expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
        "#262624",
      );

      setTheme("light");
      expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
        "#4f46e5",
      );
      document.querySelector('meta[name="theme-color"]')?.remove();
    });

    it("якщо сховище недоступне, тема все одно застосовується", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });

      expect(() => setTheme("dark")).not.toThrow();
      expect(root.dataset.theme).toBe("dark");
    });
  });

  describe("setTheme з колом від кнопки", () => {
    const origin = { x: 100, y: 50 };

    const stubTransitions = (ready: Promise<unknown> = Promise.resolve()) => {
      const startViewTransition = vi.fn((update: () => void) => {
        update();
        return { ready };
      });
      const animate = vi.fn();
      Object.assign(document, { startViewTransition });
      Object.assign(root, { animate });
      return { startViewTransition, animate };
    };

    it("міняє тему всередині переходу й розкриває коло від центру кнопки", async () => {
      const { startViewTransition, animate } = stubTransitions();

      setTheme("dark", origin);
      await Promise.resolve();

      expect(startViewTransition).toHaveBeenCalledTimes(1);
      expect(root.dataset.theme).toBe("dark");

      // As far as the farthest corner: the circle always covers the whole page.
      const radius = Math.hypot(
        Math.max(origin.x, window.innerWidth - origin.x),
        Math.max(origin.y, window.innerHeight - origin.y),
      );
      expect(animate).toHaveBeenCalledWith(
        { clipPath: ["circle(0px at 100px 50px)", `circle(${radius}px at 100px 50px)`] },
        expect.objectContaining({ pseudoElement: "::view-transition-new(root)", duration: 650 }),
      );
    });

    it("prefers-reduced-motion: тема міняється миттєво, без переходу", () => {
      stubMedia({ reduced: true });
      const { startViewTransition, animate } = stubTransitions();

      setTheme("dark", origin);

      expect(startViewTransition).not.toHaveBeenCalled();
      expect(animate).not.toHaveBeenCalled();
      expect(root.dataset.theme).toBe("dark");
    });

    it("без View Transitions API тема міняється миттєво", () => {
      setTheme("dark", origin);

      expect(root.dataset.theme).toBe("dark");
    });

    it("пропущений перехід не дає необробленої помилки", async () => {
      const { animate } = stubTransitions(Promise.reject(new Error("skipped")));

      expect(() => setTheme("dark", origin)).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(animate).not.toHaveBeenCalled();
      expect(root.dataset.theme).toBe("dark");
    });
  });

  describe("followSystemTheme", () => {
    it("поки людина не обирала, зміна системної теми змінює тему застосунку", () => {
      const stop = followSystemTheme();

      media.dark = true;
      changeListener?.();
      stop();

      expect(root.dataset.theme).toBe("dark");
    });

    it("після вибору людини системна тема не чіпає застосунок", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      root.dataset.theme = "light";

      const stop = followSystemTheme();
      media.dark = true;
      changeListener?.();
      stop();

      expect(root.dataset.theme).toBe("light");
    });
  });
});
