-- Тимчасові демо-акаунти портфоліо-деплою (IS_FOR_PORTFOLIO): акаунт і всі його дані
-- видаляються після demoExpiresAt. Для звичайних акаунтів isDemo = false, demoExpiresAt = NULL.
ALTER TABLE "User" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "demoExpiresAt" TIMESTAMP(3);

-- Для очищення (протерміновані демо-акаунти) і для підрахунку активних.
CREATE INDEX "User_isDemo_demoExpiresAt_idx" ON "User"("isDemo", "demoExpiresAt");
