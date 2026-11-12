-- AlterTable
ALTER TABLE "Response" ADD COLUMN     "quotaIds" JSONB;

-- CreateTable
CREATE TABLE "FormQuota" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "limit" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormQuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormQuota_formId_idx" ON "FormQuota"("formId");

-- AddForeignKey
ALTER TABLE "FormQuota" ADD CONSTRAINT "FormQuota_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sanity bounds the application enforces as well (Prisma does not model CHECK constraints).
ALTER TABLE "FormQuota" ADD CONSTRAINT "FormQuota_limit_positive" CHECK ("limit" >= 1);
ALTER TABLE "FormQuota" ADD CONSTRAINT "FormQuota_count_nonnegative" CHECK ("count" >= 0);
