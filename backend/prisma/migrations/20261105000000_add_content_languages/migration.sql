-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "defaultLanguage" TEXT NOT NULL DEFAULT 'uk',
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "translations" JSONB;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "translations" JSONB;
