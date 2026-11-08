-- CreateTable
CREATE TABLE "ResponseFile" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "responseId" TEXT,
    "originalName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResponseFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResponseFile_storageKey_key" ON "ResponseFile"("storageKey");

-- CreateIndex
CREATE INDEX "ResponseFile_formId_sessionKey_idx" ON "ResponseFile"("formId", "sessionKey");

-- CreateIndex
CREATE INDEX "ResponseFile_responseId_idx" ON "ResponseFile"("responseId");

-- CreateIndex
CREATE INDEX "ResponseFile_createdAt_idx" ON "ResponseFile"("createdAt");

-- AddForeignKey
ALTER TABLE "ResponseFile" ADD CONSTRAINT "ResponseFile_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseFile" ADD CONSTRAINT "ResponseFile_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;
