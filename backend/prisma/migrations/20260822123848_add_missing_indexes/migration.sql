-- CreateIndex
CREATE INDEX "Form_userId_idx" ON "Form"("userId");

-- CreateIndex
CREATE INDEX "Question_formId_idx" ON "Question"("formId");

-- CreateIndex
CREATE INDEX "Response_formId_idx" ON "Response"("formId");
