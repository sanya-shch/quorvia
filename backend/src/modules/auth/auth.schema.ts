import { z } from "zod";
import { ErrorCode } from "@quorvia/shared-types";

// bcrypt silently truncates a password to its first 72 BYTES, so a longer one only creates
// an illusion of strength, and a megabyte string in a request is needless CPU load. We
// count UTF-8 bytes (Cyrillic = 2 bytes).
export const MAX_PASSWORD_BYTES = 72;
const MAX_LOGIN_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 254;

// The email is normalized (trim + lowercase) on input, so "User@Mail.com" and
// "user@mail.com" are the same account and login lookup is case-insensitive.
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL_LENGTH, ErrorCode.VALIDATION_EMAIL_INVALID)
  .email(ErrorCode.VALIDATION_EMAIL_INVALID);

/**
 * The password strength policy applies on REGISTRATION only. Login used to have the same
 * min(6): tightening the policy later would instantly lock out existing users with older
 * passwords even though nobody changed theirs. Login only checks that a password was
 * sent (and is not absurdly long).
 *
 * Messages are stable codes (ErrorCode), not display text; they are translated on the
 * frontend (react-frontend/src/i18n/errorCodes.ts).
 */
const registerPasswordSchema = z
  .string()
  .min(8, ErrorCode.VALIDATION_PASSWORD_TOO_SHORT)
  .regex(/[a-z]/, ErrorCode.VALIDATION_PASSWORD_NO_LOWERCASE)
  .regex(/[A-Z]/, ErrorCode.VALIDATION_PASSWORD_NO_UPPERCASE)
  .regex(/[0-9]/, ErrorCode.VALIDATION_PASSWORD_NO_DIGIT)
  .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES, {
    message: ErrorCode.VALIDATION_PASSWORD_TOO_LONG,
  });

export const registerSchema = z.object({
  email: emailSchema,
  password: registerPasswordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, ErrorCode.VALIDATION_PASSWORD_REQUIRED)
    .max(MAX_LOGIN_PASSWORD_LENGTH, ErrorCode.VALIDATION_PASSWORD_TOO_LONG),
});
