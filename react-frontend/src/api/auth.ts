import type { LoginInput, RegisterInput } from "./authSchemas";
import { api, publicApi } from "./axios";

interface AuthResponse {
  // Короткоживучий (15 хв) access-токен. Довгостроковий refresh-токен у
  // відповіді НЕ приходить - сервер виставляє його окремо як httpOnly
  // cookie (JS до нього доступу не має).
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
}

interface RefreshResponse {
  accessToken: string;
}

export const authApi = {
  login: async (data: LoginInput): Promise<AuthResponse> => {
    const response = await publicApi.post("/auth/login", data, { withCredentials: true });
    return response.data;
  },

  register: async (data: Omit<RegisterInput, "confirmPassword">): Promise<AuthResponse> => {
    const response = await publicApi.post("/auth/register", data, { withCredentials: true });
    return response.data;
  },

  getMe: async (): Promise<{ id: string; email: string }> => {
    const response = await api.get("/auth/me");
    return response.data;
  },

  // Обмінює refresh-cookie на новий access-токен. Використовується axios
  // response-інтерцептором (api/axios.ts) при 401, а не напряму сторінками.
  refresh: async (): Promise<RefreshResponse> => {
    const response = await publicApi.post("/auth/refresh", undefined, { withCredentials: true });
    return response.data;
  },

  logout: async (): Promise<void> => {
    await publicApi.post("/auth/logout", undefined, { withCredentials: true });
  },
};
