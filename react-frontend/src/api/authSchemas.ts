import { z } from "zod";
import { ErrorCode } from "@quorvia/shared-types";

/**
 * Повідомлення тут - ErrorCode (ті самі коди, що й на бекенді:
 * backend/src/modules/auth/auth.schema.ts), а не готовий текст. Zod-схема
 * створюється один раз при завантаженні модуля, до того як стане відомо
 * обрану мову, тому вона фізично не може містити перекладений текст -
 * переклад коду в текст відбувається в момент показу (Login.tsx/
 * Register.tsx через translateErrorCode), не тут.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, ErrorCode.VALIDATION_EMAIL_REQUIRED)
    .email(ErrorCode.VALIDATION_EMAIL_INVALID),
  password: z.string().min(1, ErrorCode.VALIDATION_PASSWORD_REQUIRED),
});

/**
 * Складність пароля дзеркалить backend/src/modules/auth/auth.schema.ts -
 * застосовується лише при РЕЄСТРАЦІЇ (як і на бекенді), щоб користувач
 * дізнавався про слабкий пароль одразу у формі, а не лише після 400 від
 * сервера.
 */
const registerPasswordSchema = z
  .string()
  .min(8, ErrorCode.VALIDATION_PASSWORD_TOO_SHORT)
  .regex(/[a-z]/, ErrorCode.VALIDATION_PASSWORD_NO_LOWERCASE)
  .regex(/[A-Z]/, ErrorCode.VALIDATION_PASSWORD_NO_UPPERCASE)
  .regex(/[0-9]/, ErrorCode.VALIDATION_PASSWORD_NO_DIGIT)
  // bcrypt враховує лише перші 72 БАЙТИ (не символи) - див. бекенд.
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
