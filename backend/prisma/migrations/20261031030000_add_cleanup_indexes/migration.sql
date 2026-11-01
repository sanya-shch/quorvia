-- Індекси для періодичного прибирання (maintenance.service): вибірка старих
-- записів за часом створення без повного скану таблиці.

-- CreateIndex
CREATE INDEX "ResponseAttempt_startedAt_idx" ON "ResponseAttempt"("startedAt");

-- CreateIndex
CREATE INDEX "ExportJob_createdAt_idx" ON "ExportJob"("createdAt");
