import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { getJwtSecret } from "../../config/env.js";

export type AccessTokenPayload = { userId: string };

// Алгоритм зафіксовано явно і при підписі, і при перевірці: verify без
// `algorithms` приймає те, що вказано в заголовку токена, - класична
// причина атак підміною алгоритму.
const JWT_ALGORITHM = "HS256";

const ACCESS_TOKEN_TTL = "15m";
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Короткоживучий (15 хв) access-токен - летить у заголовку Authorization з
 * кожним запитом. Малий TTL - свідомий компроміс: якщо він витече з
 * клієнта (XSS, лог тощо), вікно зловживання лишається малим. Довгу сесію
 * тримає окремий refresh-токен (нижче), який у httpOnly cookie взагалі
 * недоступний з JS.
 */
export const generateAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_TTL, algorithm: JWT_ALGORITHM });

// Збережено для зворотної сумісності з наявними викликами/тестами -
// generateToken і generateAccessToken - одна й та сама функція.
export const generateToken = generateAccessToken;

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] }) as AccessTokenPayload;

/**
 * Refresh-токен НЕ є jwt - це непрозорий випадковий рядок. У БД
 * зберігається лише його SHA-256 хеш (так само, як пароль ніколи не
 * зберігається сирим), тому сам по собі витік бази даних не дає змоги
 * видавати нові access-токени від імені користувачів.
 */
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
