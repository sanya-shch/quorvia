import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { DEMO_LIMITS, ErrorCode, STORAGE_QUESTION_TYPES } from "@quorvia/shared-types";
import { prisma } from "../../prisma/prisma.js";
import { AppError } from "../../shared/middleware/errorHandler.js";
import { isPortfolioMode } from "../../config/env.js";
import { issueTokenPair } from "../auth/auth.service.js";
import { toAuthUser } from "../auth/auth.user.js";

/**
 * Demo accounts of the portfolio deployment. A visitor presses "Try the demo" and gets a real
 * account (same tables, same code paths as everyone else) that lives DEMO_LIMITS.ttlHours, holds a
 * few forms, and is deleted together with its data afterwards. Everything here is a no-op unless
 * the server runs with IS_FOR_PORTFOLIO=true, so a normal deployment never pays for it.
 */

const HOUR_MS = 60 * 60 * 1000;

// The domain is reserved (RFC 2606): nothing can ever be delivered there, so a demo account can
// not be confused with, or used for, a real mailbox.
const DEMO_EMAIL_DOMAIN = "demo.quorvia.invalid";

// Expired accounts removed per run, so one request or one tick never turns into a long delete.
const CLEANUP_BATCH = 100;

export const createDemoUser = async (now = new Date()) => {
  const active = await prisma.user.count({
    where: { isDemo: true, demoExpiresAt: { gt: now } },
  });

  if (active >= DEMO_LIMITS.maxActiveAccounts) {
    throw new AppError(ErrorCode.DEMO_CAPACITY_REACHED, 503);
  }

  // Nobody knows this password, so the account cannot be logged into again: the session lives
  // only in the refresh cookie. A cheap hash is enough for a secret that is never typed.
  const password = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 4);

  return prisma.user.create({
    data: {
      email: `demo-${crypto.randomBytes(8).toString("hex")}@${DEMO_EMAIL_DOMAIN}`,
      password,
      isDemo: true,
      demoExpiresAt: new Date(now.getTime() + DEMO_LIMITS.ttlHours * HOUR_MS),
    },
  });
};

export const startDemoSession = async () => {
  if (!isPortfolioMode()) {
    throw new AppError(ErrorCode.DEMO_UNAVAILABLE, 404);
  }

  // Cleaning up here as well as on a timer: a free web service sleeps when idle, and the timer
  // does not run while it sleeps.
  await cleanupExpiredDemoUsers().catch((error) => {
    console.error("[demo] cleanup before a new demo failed:", error);
  });

  const user = await createDemoUser();
  const tokens = await issueTokenPair(user.id, user.demoExpiresAt);

  return { ...tokens, user: toAuthUser(user) };
};

/**
 * Deletes expired demo accounts with everything they own. The relations from Form and ExportJob to
 * User have no ON DELETE CASCADE, so the order matters: exports, forms (their questions,
 * responses, attempts, quotas cascade), then the user (refresh tokens cascade). Uploaded files are
 * not touched: the portfolio deployment has uploads switched off, so there are none.
 */
export const cleanupExpiredDemoUsers = async (now = new Date()) => {
  const expired = await prisma.user.findMany({
    where: { isDemo: true, demoExpiresAt: { lt: now } },
    select: { id: true },
    take: CLEANUP_BATCH,
  });

  if (expired.length === 0) return { users: 0 };

  const userIds = expired.map((user) => user.id);

  await prisma.$transaction([
    prisma.exportJob.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.form.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);

  return { users: userIds.length };
};

const isDemoUser = async (userId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isDemo: true } });

  return user?.isDemo === true;
};

// A demo account has a few forms (creating and duplicating a form both count).
export const assertCanAddForm = async (userId: string): Promise<void> => {
  if (!isPortfolioMode()) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isDemo: true, _count: { select: { forms: true } } },
  });

  if (user?.isDemo && user._count.forms >= DEMO_LIMITS.maxForms) {
    throw new AppError(ErrorCode.DEMO_FORM_LIMIT_REACHED, 403);
  }
};

// Called when a form is saved with its full list of questions.
export const assertQuestionCountAllowed = async (
  userId: string,
  questionCount: number,
): Promise<void> => {
  if (!isPortfolioMode() || questionCount <= DEMO_LIMITS.maxQuestionsPerForm) return;

  if (await isDemoUser(userId)) {
    throw new AppError(ErrorCode.DEMO_QUESTION_LIMIT_REACHED, 403);
  }
};

// A demo form is public: anyone with the link can answer it. After maxResponsesPerForm answers it
// stops accepting more, so a shared link cannot fill the free database. A plain count before the
// submit is enough here: going a few answers over the cap under a race does not matter.
export const assertResponseCapacity = async (formId: string, ownerId: string): Promise<void> => {
  if (!isPortfolioMode() || !(await isDemoUser(ownerId))) return;

  const count = await prisma.response.count({ where: { formId } });

  if (count >= DEMO_LIMITS.maxResponsesPerForm) {
    throw new AppError(ErrorCode.DEMO_RESPONSE_LIMIT_REACHED, 403);
  }
};

// Question types that store files have no place to put them on the portfolio host, for any user.
export const assertQuestionTypesAvailable = (questions: { type: string }[]): void => {
  if (!isPortfolioMode()) return;

  const storageTypes: readonly string[] = STORAGE_QUESTION_TYPES;

  if (questions.some((question) => storageTypes.includes(question.type))) {
    throw new AppError(ErrorCode.FEATURE_DISABLED, 403);
  }
};
