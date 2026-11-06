import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { getJwtSecret } from "../../config/env.js";

export type AccessTokenPayload = { userId: string };

// The algorithm is pinned explicitly for both signing and verifying: verify without
// `algorithms` accepts whatever the token header says, the classic cause of algorithm
// confusion attacks.
const JWT_ALGORITHM = "HS256";

const ACCESS_TOKEN_TTL = "15m";
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Short-lived (15 min) access token, sent in the Authorization header with every request.
 * The short TTL is a deliberate trade-off: if it leaks from the client (XSS, a log, ...) the
 * abuse window stays small. A long session is held by the separate refresh token (below),
 * which lives in an httpOnly cookie and is not reachable from JS at all.
 */
export const generateAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_TTL, algorithm: JWT_ALGORITHM });

// Kept for backward compatibility with existing callers/tests: generateToken and
// generateAccessToken are the same function.
export const generateToken = generateAccessToken;

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] }) as AccessTokenPayload;

// A refresh token is NOT a JWT: it is an opaque random string. Only its SHA-256 hash is
// stored in the DB (just as a password is never stored raw), so a database leak alone does
// not let anyone mint new access tokens for users.
export const generateRefreshToken = (): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} => {
  const token = crypto.randomBytes(48).toString("hex");

  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  };
};

export const hashRefreshToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");
