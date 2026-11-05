import { z } from 'zod';
import { loginSchema, registerSchema } from './auth.schema.js';

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export type AuthUser = {
  id: string;
  email: string;
};

/**
 * accessToken - єдине, що бачить JS-код фронтенду; refresh-токен передається
 * окремо, у httpOnly cookie (виставляється контролером, у тіло відповіді
 * не потрапляє).
 */
export type RegisterDto = {
  accessToken: string;
  user: AuthUser;
};

export type LoginDto = {
  accessToken: string;
  user: AuthUser;
};

export type RefreshDto = {
  accessToken: string;
  user: AuthUser;
};

export type GetMeDto = AuthUser;
