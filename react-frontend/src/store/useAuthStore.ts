import { create } from "zustand";

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  /**
   * The access token lives ONLY in this tab's memory (not localStorage/sessionStorage): it does
   * not survive a page reload and is restored "silently" through the httpOnly refresh cookie
   * (restoreSession in api/axios.ts). This way the token does not sit in storage readable by any
   * script on the origin and does not "hang" in other tabs after logout.
   */
  token: string | null;
  isAuthenticated: boolean;
  // false until the first attempt to restore the session after app load has finished.
  // ProtectedRoute does not redirect to /login until this is known, otherwise every page reload
  // would throw the user to the login.
  isInitialized: boolean;
  setAuth: (user: User, token: string) => void;
  // Updates only the access token, leaving user alone (used when a refresh response carries no user).
  setToken: (token: string) => void;
  clearAuth: () => void;
}

// Migration: earlier versions kept the token in localStorage. Remove the leftover so an old
// token does not stay in the browser after the update.
try {
  localStorage.removeItem("token");
} catch {
  // storage is unavailable (private mode, etc.): nothing to remove
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
