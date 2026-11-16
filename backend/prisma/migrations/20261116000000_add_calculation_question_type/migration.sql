-- AlterEnum
-- A new enum value goes in its own migration: PostgreSQL does not let a value added in a
-- transaction be used in the same one (see docs/question-types.md).
ALTER TYPE "QuestionType" ADD VALUE 'CALCULATION';
