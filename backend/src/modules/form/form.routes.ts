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
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

const router = Router();

router.post(
  '/',
  authMiddleware,
  validate(createFormSchema),
  asyncHandler(createFormHandler)
);
router.get('/', authMiddleware, asyncHandler(getUserFormsHandler));
router.delete('/:formId', authMiddleware, asyncHandler(deleteFormHandler));
router.get('/:formId/admin', authMiddleware, asyncHandler(getUserFormHandler));
router.patch(
  '/:formId',
  authMiddleware,
  validate(updateFormSchema),
  asyncHandler(updateFormHandler)
);

router.get('/public/:shareId', getPublicFormByShareId);

router.patch(
  '/:formId/publish',
  authMiddleware,
  asyncHandler(publishFormHandler)
);
router.patch(
  '/:formId/unpublish',
  authMiddleware,
  asyncHandler(unpublishFormHandler)
);

router.post(
  '/:formId/duplicate',
  authMiddleware,
  asyncHandler(duplicateFormHandler)
);

export default router;
