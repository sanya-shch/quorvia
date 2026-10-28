import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./auth.schema.js";

describe("registerSchema", () => {
  it("приймає валідний email і пароль, що задовольняє політику складності", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "Str0ngPass" }).success).toBe(
      true,
    );
  });

  it("відхиляє невалідний email", () => {
    expect(registerSchema.safeParse({ email: "not-an-email", password: "Str0ngPass" }).success).toBe(
      false,
    );
  });

  it("відхиляє закороткий пароль (<8 символів)", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "Str0ng1" }).success).toBe(
      false,
    );
  });

  it("відхиляє пароль без великої літери", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "str0ngpass" }).success).toBe(
      false,
    );
  });

  it("відхиляє пароль без малої літери", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "STR0NGPASS" }).success).toBe(
      false,
    );
  });

  it("відхиляє пароль без цифри", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "StrongPass" }).success).toBe(
      false,
    );
  });

  it("відхиляє відсутні поля", () => {
    expect(registerSchema.safeParse({}).success).toBe(false);
  });
});

describe("нормалізація email і межі пароля", () => {
  it("registerSchema: trim + нижній регістр для email", () => {
    const result = registerSchema.parse({ email: "  User@Mail.COM ", password: "Str0ngPass" });

    expect(result.email).toBe("user@mail.com");
  });

  it("loginSchema: той самий email у будь-якому регістрі нормалізується однаково", () => {
    const result = loginSchema.parse({ email: "User@Mail.COM", password: "x" });

    expect(result.email).toBe("user@mail.com");
  });

  it("відхиляє email довший за 254 символи", () => {
    const email = `${"a".repeat(250)}@b.com`;

    expect(registerSchema.safeParse({ email, password: "Str0ngPass" }).success).toBe(false);
  });

  it("відхиляє пароль понад 72 БАЙТИ (кирилиця = 2 байти)", () => {
    const password = "Аа1" + "б".repeat(35);

    expect(registerSchema.safeParse({ email: "a@b.com", password }).success).toBe(false);
  });

  it("приймає пароль рівно 72 байти", () => {
    const password = "Aa1" + "x".repeat(69);

    expect(registerSchema.safeParse({ email: "a@b.com", password }).success).toBe(true);
  });

  it("loginSchema відхиляє абсурдно довгий пароль", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x".repeat(129) }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("приймає валідний email і непорожній пароль, незалежно від складності", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "123456" }).success).toBe(true);
  });

  it("відхиляє невалідний email", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "123456" }).success).toBe(
      false,
    );
  });

  it("відхиляє порожній пароль", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });

  it("відхиляє відсутні поля", () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
  });
});
