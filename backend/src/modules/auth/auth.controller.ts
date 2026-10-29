import { Request, Response } from "express";
import { prisma } from "../../prisma/prisma.js";
import {
  loginHandler,
  refreshAccessToken,
  registerUser,
  revokeRefreshToken,
} from "./auth.service.js";
import {
  AuthUser,
  GetMeDto,
  LoginDto,
  LoginInput,
  RefreshDto,
  RegisterDto,
  RegisterInput,
} from "./auth.types.js";
import { AuthLocals } from "../../shared/middleware/auth.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { ErrorCode } from "@quorvia/shared-types";
import {
  clearRefreshTokenCookieOptions,
  REFRESH_TOKEN_COOKIE_NAME,
  refreshTokenCookieOptions,
} from "../../shared/utils/cookies.js";

const sendAuthResponse = (
  res: Response<RegisterDto | LoginDto>,
  tokens: { accessToken: string; refreshToken: string; refreshTokenExpiresAt: Date },
  user: AuthUser,
) => {
  res.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    tokens.refreshToken,
    refreshTokenCookieOptions(tokens.refreshTokenExpiresAt),
  );
  res.json({ accessToken: tokens.accessToken, user });
};

export const register = async (req: Request<{}, {}, RegisterInput>, res: Response<RegisterDto>) => {
  const { email, password } = req.body;

  const { user, ...tokens } = await registerUser(email, password);

  sendAuthResponse(res, tokens, user);
};

export const login = async (req: Request<{}, {}, LoginInput>, res: Response<LoginDto>) => {
  const { email, password } = req.body;

  const { user, ...tokens } = await loginHandler(email, password);

  sendAuthResponse(res, tokens, user);
};

export const refresh = async (req: Request, res: Response<RefreshDto>) => {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;

  const tokens = await refreshAccessToken(refreshToken);

  res.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    tokens.refreshToken,
    refreshTokenCookieOptions(tokens.refreshTokenExpiresAt),
  );
  res.json({ accessToken: tokens.accessToken });
};

export const logout = async (req: Request, res: Response<{ success: true }>) => {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;

  await revokeRefreshToken(refreshToken);

  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, clearRefreshTokenCookieOptions());
  res.json({ success: true });
};

export const getMeHandler = async (req: Request, res: Response<GetMeDto>) => {
  const userId = (res.locals as AuthLocals).userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user) {
    throw new AppError(ErrorCode.AUTH_USER_NOT_FOUND, 404);
  }

  res.json(user);
};
