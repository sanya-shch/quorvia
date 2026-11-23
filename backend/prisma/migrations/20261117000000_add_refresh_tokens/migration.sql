-- Таблиця RefreshToken є в schema.prisma і в коді (ротація refresh-токенів), але жодна міграція її
-- не створювала: локально вона з'явилась через `prisma db push`. Без цієї міграції
-- `prisma migrate deploy` на чистій базі (наприклад, на хостингу) лишає базу без таблиці, і
-- реєстрація/логін падають. Скрипт ідемпотентний: у базі, де таблиця вже є від `db push`,
-- він нічого не змінює.
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");

DO $$
BEGIN
    ALTER TABLE "RefreshToken"
        ADD CONSTRAINT "RefreshToken_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;
