-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "closesAt" TIMESTAMP(3),
ADD COLUMN     "maxResponses" INTEGER,
ADD COLUMN     "responseCount" INTEGER NOT NULL DEFAULT 0;

-- Existing forms already have responses: start the counter from the real number.
UPDATE "Form" SET "responseCount" = (
  SELECT COUNT(*) FROM "Response" WHERE "Response"."formId" = "Form"."id"
);
