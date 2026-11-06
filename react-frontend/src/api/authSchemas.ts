import { z } from "zod";
import { ErrorCode } from "@quorvia/shared-types";

/**
 * Messages here are ErrorCode values (the same codes as on the backend:
 * backend/src/modules/auth/auth.schema.ts), not display text. The Zod schema is created once at
 * module load, before the selected language is known, so it physically cannot contain translated
 * text; the code is translated at display time (Login.tsx/Register.tsx via translateErrorCode).
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, ErrorCode.VALIDATION_EMAIL_REQUIRED)
    .email(ErrorCode.VALIDATION_EMAIL_INVALID),
  password: z.string().min(1, ErrorCode.VALIDATION_PASSWORD_REQUIRED),
});

// Password strength mirrors backend/src/modules/auth/auth.schema.ts and applies on REGISTRATION
// only (as on the backend), so the user learns about a weak password in the form right away, not
// only after a 400 from the server.
const registerPasswordSchema = z
  .string()
  .min(8, ErrorCode.VALIDATION_PASSWORD_TOO_SHORT)
  .regex(/[a-z]/, ErrorCode.VALIDATION_PASSWORD_NO_LOWERCASE)
  .regex(/[A-Z]/, ErrorCode.VALIDATION_PASSWORD_NO_UPPERCASE)
  .regex(/[0-9]/, ErrorCode.VALIDATION_PASSWORD_NO_DIGIT)
  // bcrypt counts only the first 72 BYTES (not characters); see the backend.
  .refine((value) => new TextEncoder().encode(value).length <= 72, {
    message: ErrorCode.VALIDATION_PASSWORD_TOO_LONG,
  });

export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, ErrorCode.VALIDATION_EMAIL_REQUIRED)
      .email(ErrorCode.VALIDATION_EMAIL_INVALID),
    password: registerPasswordSchema,
    confirmPassword: z.string().min(1, ErrorCode.VALIDATION_CONFIRM_PASSWORD_REQUIRED),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: ErrorCode.VALIDATION_PASSWORDS_DO_NOT_MATCH,
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
