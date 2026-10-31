import { Router } from 'express';
import {
  createFormHandler,
  deleteFormHandler,
  duplicateFormHandler,
  getUserFormHandler,
  getPublicFormByShareId,
  getUserFormsHandler,
  publishFormHandler,
  unpublishFormHandler,
  updateFormHandler,
} from './form.controller.js';
import { authMiddleware } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { createFormSchema, updateFormSchema } from './form.schema.js';

const router = Router();

router.post(
  '/',
  authMiddleware,
  validate(createFormSchema),
  createFormHandler
);
router.get('/', authMiddleware, getUserFormsHandler);
router.delete('/:formId', authMiddleware, deleteFormHandler);
router.get('/:formId/admin', authMiddleware, getUserFormHandler);
router.patch(
  '/:formId',
  authMiddleware,
  validate(updateFormSchema),
  updateFormHandler
);

router.get('/public/:shareId', getPublicFormByShareId);

router.patch(
  '/:formId/publish',
  authMiddleware,
  publishFormHandler
);
router.patch(
  '/:formId/unpublish',
  authMiddleware,
  unpublishFormHandler
);

router.post(
  '/:formId/duplicate',
  authMiddleware,
  duplicateFormHandler
);

export default router;
