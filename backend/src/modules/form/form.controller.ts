import { Request, Response } from 'express';
import {
  createForm,
  deleteForm,
  duplicateForm,
  getUserForm,
  getFormByShareId,
  getUserForms,
  publishForm,
  unpublishForm,
  updateForm,
} from './form.service.js';
import {
  CreateFormInput,
  FormDto,
  PublicFormDto,
  UpdateFormInput,
  UserFormDto,
  UserFormsDto,
} from './form.types.js';
import { AuthLocals } from '../../shared/middleware/auth.js';

export const createFormHandler = async (
  req: Request<{ formId: string }, {}, CreateFormInput>,
  res: Response<FormDto>
) => {
  const { title, description, defaultLanguage } = req.body;
  const userId = (res.locals as AuthLocals).userId;

  const form = await createForm({
    title,
    description,
    defaultLanguage,
    userId,
  });

  res.json(form);
};

export const getUserFormsHandler = async (
  req: Request<{ formId: string }>,
  res: Response<UserFormsDto>
) => {
  const userId = (res.locals as AuthLocals).userId;

  const forms = await getUserForms(userId);

  res.json(forms);
};

export const deleteFormHandler = async (
  req: Request<{ formId: string }>,
  res: Response<{ success: boolean }>
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  await deleteForm(formId, userId);

  res.json({ success: true });
};

export const getUserFormHandler = async (
  req: Request<{ formId: string }>,
  res: Response<UserFormDto>
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  const form = await getUserForm(formId, userId);

  res.json(form);
};

export const publishFormHandler = async (
  req: Request<{ formId: string }>,
  res: Response<{ success: boolean }>
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  await publishForm(formId, userId);

  res.json({ success: true });
};

export const unpublishFormHandler = async (
  req: Request<{ formId: string }>,
  res: Response<{ success: boolean }>
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  await unpublishForm(formId, userId);

  res.json({ success: true });
};

export const updateFormHandler = async (
  req: Request<{ formId: string }, {}, UpdateFormInput>,
  res: Response<{ success: boolean }>
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  const result = await updateForm(formId, userId, req.body);

  res.json(result);
};

export const duplicateFormHandler = async (
  req: Request<{ formId: string }>,
  res: Response<FormDto>
) => {
  const { formId } = req.params;
  const userId = (res.locals as AuthLocals).userId;

  const result = await duplicateForm(formId, userId);

  res.json(result);
};

export const getPublicFormByShareId = async (
  req: Request<{ shareId: string }>,
  res: Response<PublicFormDto>
) => {
  const { shareId } = req.params;

  const forms = await getFormByShareId(shareId);

  res.json(forms);
};
