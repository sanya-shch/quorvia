import type { LoginInput, RegisterInput } from "./authSchemas";
import { publicApi } from "./axios";

interface AuthResponse {
  // Short-lived (15 min) access token. The long-lived refresh token is NOT in the response: the
  // server sets it separately as an httpOnly cookie (JS has no access to it).
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
}

interface RefreshResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
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

  // Exchanges the refresh cookie for a new access token and the user. Used by the axios response
  // interceptor (api/axios.ts) on 401, not by pages directly.
  refresh: async (): Promise<RefreshResponse> => {
    const response = await publicApi.post("/auth/refresh", undefined, { withCredentials: true });
    return response.data;
  },

  logout: async (): Promise<void> => {
    await publicApi.post("/auth/logout", undefined, { withCredentials: true });
  },
};
