import { Request, Response } from "express";
import type { FormQuota } from "@quorvia/shared-types";
import { AuthLocals } from "../../shared/middleware/auth.js";
import {
  createQuota,
  deleteQuota,
  listQuotas,
  recountQuota,
  updateQuota,
} from "./quota.service.js";
import type { CreateQuotaInput, UpdateQuotaInput } from "./quota.types.js";

const userIdOf = (res: Response) => (res.locals as AuthLocals).userId;

export const listQuotasHandler = async (
  req: Request<{ formId: string }>,
  res: Response<FormQuota[]>,
) => {
  res.json(await listQuotas(req.params.formId, userIdOf(res)));
};

export const createQuotaHandler = async (
  req: Request<{ formId: string }, {}, CreateQuotaInput>,
  res: Response<FormQuota>,
) => {
  res.status(201).json(await createQuota(req.params.formId, userIdOf(res), req.body));
};

export const updateQuotaHandler = async (
  req: Request<{ formId: string; quotaId: string }, {}, UpdateQuotaInput>,
  res: Response<FormQuota>,
) => {
  const { formId, quotaId } = req.params;

  res.json(await updateQuota(formId, quotaId, userIdOf(res), req.body));
};

export const deleteQuotaHandler = async (
  req: Request<{ formId: string; quotaId: string }>,
  res: Response<{ success: boolean }>,
) => {
  const { formId, quotaId } = req.params;

  await deleteQuota(formId, quotaId, userIdOf(res));

  res.json({ success: true });
};

export const recountQuotaHandler = async (
  req: Request<{ formId: string; quotaId: string }>,
  res: Response<FormQuota>,
) => {
  const { formId, quotaId } = req.params;

  res.json(await recountQuota(formId, quotaId, userIdOf(res)));
};
