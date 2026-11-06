import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/prisma.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "../../shared/utils/jwt.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { ErrorCode } from "@quorvia/shared-types";

// bcrypt cost factor: 12 rounds (~250 ms on a modern CPU), the current sensible minimum.
// Older hashes (cost 10) stay valid because bcrypt stores the cost inside the hash.
export const BCRYPT_COST = 12;

/**
 * A dummy hash to equalize response time: when no user has the email we still run
 * bcrypt.compare, otherwise the answer for an unknown email is noticeably faster than for a
 * wrong password and timing reveals which emails are registered. Computed once, lazily
 * (so it does not slow module import and tests).
 */
let dummyHashPromise: Promise<string> | undefined;
const getDummyHash = () =>
  (dummyHashPromise ??= bcrypt.hash("dummy-password-for-timing", BCRYPT_COST));

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

// Single place that issues a token pair for register/login/refresh. Register and login
// used to duplicate (and desynchronize) this logic with different TTLs.
const issueTokenPair = async (userId: string): Promise<TokenPair> => {
  const accessToken = generateAccessToken({ userId });
  const refresh = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      tokenHash: refresh.tokenHash,
      userId,
      expiresAt: refresh.expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
};

export const registerUser = async (email: string, password: string) => {
  const hashed = await bcrypt.hash(password, BCRYPT_COST);

  let user;
  try {
    user = await prisma.user.create({
      data: { email, password: hashed },
    });
  } catch (error: unknown) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;

    if (prismaError.code === "P2002") {
      throw new AppError(ErrorCode.AUTH_EMAIL_ALREADY_IN_USE, 409);
    }

    throw error;
  }

  const tokens = await issueTokenPair(user.id);

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
    },
  };
};

export const loginHandler = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    await bcrypt.compare(password, await getDummyHash());
    throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, 401);
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, 401);
  }

  const tokens = await issueTokenPair(user.id);

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
    },
  };
};

// Window in which reuse of an already revoked token counts as a legitimate client race
// (two tabs refreshing at once), not theft. Outside it see refreshAccessToken.
const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * Exchanges a refresh token for a new pair.
 *
 * Rotation: the used token is revoked before the new one is issued. Revocation is ATOMIC
 * (updateMany with revokedAt: null and a count check): a findUnique -> update let two
 * parallel requests with one token both pass and each get a valid pair. Now exactly one wins.
 *
 * Reuse detection: a token that is ALREADY revoked (and not a race within
 * REFRESH_REUSE_GRACE_MS) was either stolen or kept by a stale client; either way ALL of the
 * user's active tokens are revoked and the session must be reopened with a login.
 */
export const refreshAccessToken = async (refreshToken: string | undefined) => {
  if (!refreshToken) {
    throw new AppError(ErrorCode.AUTH_REFRESH_TOKEN_MISSING, 401);
  }

  const tokenHash = hashRefreshToken(refreshToken);
  // The user comes with the token row (one query), so the client does not need a
  // separate /auth/me round trip after restoring a session.
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!stored) {
    throw new AppError(ErrorCode.AUTH_REFRESH_TOKEN_INVALID, 401);
  }

  if (stored.revokedAt) {
    if (Date.now() - stored.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    throw new AppError(ErrorCode.AUTH_REFRESH_TOKEN_INVALID, 401);
  }

  if (stored.expiresAt < new Date()) {
    throw new AppError(ErrorCode.AUTH_REFRESH_TOKEN_INVALID, 401);
  }

  const { count } = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count !== 1) {
    throw new AppError(ErrorCode.AUTH_REFRESH_TOKEN_INVALID, 401);
  }

  const tokens = await issueTokenPair(stored.userId);

  return { ...tokens, user: { id: stored.user.id, email: stored.user.email } };
};

// A real (not no-op) logout: revokes the refresh token in the DB. The access token, as
// always with JWT, stays technically valid until its 15-minute expiry, but without a valid
// refresh token the session cannot be extended.
export const revokeRefreshToken = async (refreshToken: string | undefined) => {
  if (!refreshToken) {
    return;
  }

  const tokenHash = hashRefreshToken(refreshToken);

  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

const REFRESH_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// Deletes tokens that expired or were revoked more than a week ago (the week is kept for
// investigations/reuse detection). Without it the RefreshToken table grows forever: a row
// per login and per access-token refresh. Called periodically from worker.ts.
export const cleanupRefreshTokens = async (now = new Date()) => {
  const threshold = new Date(now.getTime() - REFRESH_TOKEN_RETENTION_MS);

  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: threshold } }, { revokedAt: { lt: threshold } }],
    },
  });

  return count;
};
