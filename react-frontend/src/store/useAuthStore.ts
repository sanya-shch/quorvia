import { create } from "zustand";

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  /**
   * Access-токен живе ЛИШЕ в пам'яті цієї вкладки (не в localStorage/
   * sessionStorage): він не переживає перезавантаження сторінки, а
   * відновлюється "мовчки" через httpOnly refresh-cookie (restoreSession у
   * api/axios.ts). Так токен не лежить у сховищі, яке читає будь-який
   * скрипт на origin, і не "зависає" в чужих вкладках після logout.
   */
  token: string | null;
  isAuthenticated: boolean;
  /**
   * false, доки не завершилась перша спроба відновити сесію після
   * завантаження застосунку. ProtectedRoute не редіректить на /login, поки
   * це не з'ясовано - інакше кожне оновлення сторінки викидало б на логін.
   */
  isInitialized: boolean;
  setAuth: (user: User, token: string) => void;
  // Оновлює лише access-токен (після мовчазного /auth/refresh в
  // api/axios.ts), не чіпаючи user - сам user підтягується наступним
  // успішним запитом (напр. authApi.getMe() у ProtectedRoute).
  setToken: (token: string) => void;
  clearAuth: () => void;
}

// Міграція: попередні версії зберігали токен у localStorage. Прибираємо
// залишок, щоб старий токен не лежав у браузері після оновлення.
try {
  localStorage.removeItem("token");
} catch {
  // сховище недоступне (приватний режим тощо) - нічого прибирати
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isInitialized: false,

  setAuth: (user, token) => set({ user, token, isAuthenticated: true, isInitialized: true }),

  setToken: (token) => set({ token, isAuthenticated: true, isInitialized: true }),

  clearAuth: () => set({ user: null, token: null, isAuthenticated: false, isInitialized: true }),
}));
