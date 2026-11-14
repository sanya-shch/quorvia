-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "scoring" JSONB;

-- AlterTable
ALTER TABLE "Response" ADD COLUMN     "maxScore" DOUBLE PRECISION,
ADD COLUMN     "score" DOUBLE PRECISION,
ADD COLUMN     "scoreCategoryId" TEXT;
