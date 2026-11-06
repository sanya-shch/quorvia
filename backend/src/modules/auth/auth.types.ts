import { z } from 'zod';
import { loginSchema, registerSchema } from './auth.schema.js';

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export type AuthUser = {
  id: string;
  email: string;
};

// accessToken is the only thing frontend JS sees; the refresh token travels separately in
// an httpOnly cookie (set by the controller, never in the response body).
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
