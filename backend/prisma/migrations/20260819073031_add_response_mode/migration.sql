-- CreateEnum
CREATE TYPE "ResponseMode" AS ENUM ('ALL_AT_ONCE', 'STEP_BY_STEP');

-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "responseMode" "ResponseMode" NOT NULL DEFAULT 'ALL_AT_ONCE';
