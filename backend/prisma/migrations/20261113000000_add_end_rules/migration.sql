-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "endRules" JSONB;

-- AlterTable
ALTER TABLE "Response" ADD COLUMN     "endRuleId" TEXT;
