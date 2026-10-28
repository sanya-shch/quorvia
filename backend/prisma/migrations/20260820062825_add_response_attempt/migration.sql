-- CreateTable
CREATE TABLE "ResponseAttempt" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "visibleQuestionIds" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ResponseAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResponseAttempt_formId_idx" ON "ResponseAttempt"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseAttempt_formId_sessionKey_key" ON "ResponseAttempt"("formId", "sessionKey");

-- AddForeignKey
ALTER TABLE "ResponseAttempt" ADD CONSTRAINT "ResponseAttempt_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
