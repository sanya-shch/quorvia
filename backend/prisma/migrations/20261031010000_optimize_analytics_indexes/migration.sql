-- Аналітика обходить відповіді форми порціями (ORDER BY createdAt, id), а
-- список відповідей сортується за createdAt DESC - обидва запити обслуговує
-- один складений індекс. Окремий індекс по formId став його префіксом.
-- На великій таблиці створюй індекс окремо через CREATE INDEX CONCURRENTLY.

-- DropIndex
DROP INDEX "Response_formId_idx";

-- CreateIndex
CREATE INDEX "Response_formId_createdAt_id_idx" ON "Response"("formId", "createdAt", "id");

-- DropIndex (зайвий: покритий унікальним індексом (formId, sessionKey))
DROP INDEX "ResponseAttempt_formId_idx";
