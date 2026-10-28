import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/prisma.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "../../shared/utils/jwt.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { ErrorCode } from "@surveycraft/shared-types";

/**
 * Cost-фактор bcrypt: 12 раундів (~250 мс на сучасному CPU) - сучасний
 * мінімум; 10 було дефолтом із туторіалів 2010-х. Старі хеші (cost 10)
 * лишаються валідними - bcrypt зберігає cost усередині самого хеша.
 */
export const BCRYPT_COST = 12;

/**
 * Хеш-пустушка для вирівнювання часу відповіді: якщо користувача з таким
 * email немає, ми все одно виконуємо bcrypt.compare, інакше відповідь на
 * неіснуючий email помітно швидша за відповідь на невірний пароль, і за
 * часом можна визначати, які email зареєстровані. Рахується один раз,
 * ліниво (щоб не гальмувати імпорт модуля і тести).
 */
let dummyHashPromise: Promise<string> | undefined;
const getDummyHash = () => (dummyHashPromise ??= bcrypt.hash("dummy-password-for-timing", BCRYPT_COST));

type TokenPair = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

/**
 * Спільна точка видачі пари токенів для register/login/refresh - раніше
 * register і login дублювали (і розсинхронізовували) цю логіку: register
 * ходив через generateToken (15 хв), а login підписував токен інлайново з
 * TTL 7 днів. Тепер джерело правди одне.
 */
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

/**
 * Вікно, у межах якого повторне використання вже відкликаного токена
 * вважається "гонкою" легітимного клієнта (дві вкладки одночасно оновили
 * сесію), а не крадіжкою. Поза цим вікном - див. refreshAccessToken.
 */
const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * Обмін refresh-токена на нову пару.
 *
 * Ротація: використаний токен відкликається, перш ніж видати новий.
 * Відкликання АТОМАРНЕ (updateMany з умовою revokedAt: null і перевіркою
 * count): раніше було findUnique -> update, і два паралельні запити з
 * одним токеном обидва проходили перевірку та отримували по валідній
 * парі. Тепер переможе рівно один.
 *
 * Reuse detection: якщо приходить токен, який ВЖЕ відкликано (і це не
 * гонка в межах REFRESH_REUSE_GRACE_MS), значить його або вкрали, або
 * клієнт зберіг старий - у будь-якому разі відкликаємо ВСІ активні
 * токени користувача, і сесію доведеться відкрити заново логіном.
 */
export const refreshAccessToken = async (refreshToken: string | undefined) => {
  if (!refreshToken) {
    throw new AppError(ErrorCode.AUTH_REFRESH_TOKEN_MISSING, 401);
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

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

  return issueTokenPair(stored.userId);
};

/**
 * Реальний (а не no-op) logout: відкликає refresh-токен у БД. Сам
 * access-токен, як завжди з JWT, лишається технічно дійсним до свого
 * 15-хвилинного спливу - але без дійсного refresh-токена сесію більше не
 * можна продовжити.
 */
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

/**
 * Видаляє токени, що прострочені або відкликані понад тиждень тому
 * (тиждень лишається для розслідувань/reuse detection). Без цього таблиця
 * RefreshToken росте безкінечно - по рядку на кожен login і кожне
 * оновлення access-токена. Викликається періодично з worker.ts.
 */
export const cleanupRefreshTokens = async (now = new Date()) => {
  const threshold = new Date(now.getTime() - REFRESH_TOKEN_RETENTION_MS);

  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: threshold } }, { revokedAt: { lt: threshold } }],
    },
  });

  return count;
};
