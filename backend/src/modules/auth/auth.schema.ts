import { z } from "zod";
import { ErrorCode } from "@surveycraft/shared-types";

/**
 * bcrypt мовчки обрізає пароль до перших 72 БАЙТІВ, тож довший пароль
 * лише створює ілюзію надійності, а мегабайтний рядок у запиті - зайве
 * навантаження на CPU. Рахуємо саме байти UTF-8 (кирилиця = 2 байти).
 */
export const MAX_PASSWORD_BYTES = 72;
const MAX_LOGIN_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 254;

/**
 * Email нормалізується (trim + нижній регістр) ще на вході, тож
 * "User@Mail.com" і "user@mail.com" - той самий акаунт, а не два різних
 * (і пошук при логіні не залежить від регістру).
 */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL_LENGTH, ErrorCode.VALIDATION_EMAIL_INVALID)
  .email(ErrorCode.VALIDATION_EMAIL_INVALID);

/**
 * Політика складності пароля застосовується лише при РЕЄСТРАЦІЇ. Раніше
 * той самий min(6) стояв і на логіні - тобто якщо політику колись
 * посилити, існуючі користувачі зі старими паролями миттєво втратили б
 * змогу залогінитись, хоча пароль ніхто не міняв. Логін нижче лише
 * перевіряє, що пароль взагалі передано (і не є абсурдно довгим).
 *
 * Повідомлення - стабільні коди (ErrorCode), а не готовий текст: переклад
 * на фронтенді через i18next (react-frontend/src/i18n/errorCodes.ts).
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
