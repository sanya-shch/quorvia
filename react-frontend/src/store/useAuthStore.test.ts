import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "./useAuthStore";

const reset = () =>
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false, isInitialized: false });

describe("useAuthStore", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    reset();
  });

  it("початково сесія не відновлена: немає токена, isInitialized=false", () => {
    const state = useAuthStore.getState();

    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isInitialized).toBe(false);
  });

  it("setAuth/setToken тримають токен ЛИШЕ в пам'яті - нічого не пишуть у localStorage/sessionStorage", () => {
    useAuthStore.getState().setAuth({ id: "u1", email: "a@b.com" }, "access-1");
    useAuthStore.getState().setToken("access-2");

    expect(useAuthStore.getState().token).toBe("access-2");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("clearAuth скидає сесію, але позначає ініціалізацію завершеною (щоб ProtectedRoute не зациклився)", () => {
    useAuthStore.getState().setAuth({ id: "u1", email: "a@b.com" }, "access-1");

    useAuthStore.getState().clearAuth();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isInitialized).toBe(true);
  });
});
