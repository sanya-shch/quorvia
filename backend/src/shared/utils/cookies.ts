import { CookieOptions } from "express";
import { isProduction } from "../../config/env.js";

export const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

/**
 * The refresh token lives only in an httpOnly cookie, unreachable from JS and therefore
 * from XSS (unlike the access token, which we deliberately keep in frontend memory, not
 * localStorage). `path` limits the cookie to the /api/auth endpoints so the browser does not
 * send it with every other request.
 */
export const refreshTokenCookieOptions = (expiresAt: Date): CookieOptions => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: "lax",
  path: "/api/auth",
  expires: expiresAt,
});

export const clearRefreshTokenCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: "lax",
  path: "/api/auth",
});
