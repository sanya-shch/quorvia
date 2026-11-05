import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/useAuthStore";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  const instance = { post, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } };

  return { ...actual, default: { ...actual.default, create: () => instance } };
});

const { refreshAccessToken } = await import("./axios");

describe("refreshAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false, isInitialized: false });
  });

  it("stores the token and the user from a single /auth/refresh response", async () => {
    post.mockResolvedValue({ data: { accessToken: "fresh", user: { id: "u1", email: "a@b.com" } } });

    await expect(refreshAccessToken()).resolves.toBe("fresh");

    expect(post).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      token: "fresh",
      user: { id: "u1", email: "a@b.com" },
      isAuthenticated: true,
      isInitialized: true,
    });
  });

  it("returns null and leaves the store untouched when refresh fails", async () => {
    post.mockRejectedValue(new Error("401"));

    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });
});
