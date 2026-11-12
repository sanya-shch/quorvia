import {
  QUOTA_LIMITS,
  type ConditionGroup,
  type FormQuota,
  type FormQuotaInput,
} from "@quorvia/shared-types";
import type { Question } from "../../types/formBuilder";
import { newConditionRule } from "./components/editors/conditionRules";
import { conditionTargets, isConditionValueFilled } from "./endRules";

// Everything about quotas in the builder that is not React. A quota is edited as a draft (the limit
// is typed as text) and saved explicitly, because saving changes what the server counts.

export interface QuotaDraft {
  // null: a quota that was not saved yet.
  id: string | null;
  name: string;
  // As typed: it can be empty or not a number yet.
  limit: string;
  message: string;
  condition: ConditionGroup;
}

export const draftFromQuota = (quota: FormQuota): QuotaDraft => ({
  id: quota.id,
  name: quota.name,
  limit: String(quota.limit),
  message: quota.message ?? "",
  condition: quota.condition,
});

// A new draft on the first usable question; null when no question can be used.
export const newQuotaDraft = (questions: readonly Question[]): QuotaDraft | null => {
  const target = conditionTargets(questions)[0];

  if (!target) return null;

  return {
    id: null,
    name: "",
    limit: "",
    message: "",
    condition: { logic: "AND", rules: [newConditionRule(target as Question & { id: string })] },
  };
};

export const parseLimit = (limit: string): number | null => {
  const trimmed = limit.trim();

  if (!/^\d+$/.test(trimmed)) return null;

  const value = Number(trimmed);

  return value >= QUOTA_LIMITS.limit.min && value <= QUOTA_LIMITS.limit.max ? value : null;
};

export const isDraftComplete = (draft: QuotaDraft): boolean =>
  draft.name.trim() !== "" &&
  parseLimit(draft.limit) !== null &&
  draft.condition.rules.length > 0 &&
  draft.condition.rules.every((rule) => isConditionValueFilled(rule.value));

// What is sent to the server; null while the draft is not complete.
export const draftToInput = (draft: QuotaDraft): FormQuotaInput | null => {
  const limit = parseLimit(draft.limit);

  if (!isDraftComplete(draft) || limit === null) return null;

  return {
    name: draft.name.trim(),
    condition: draft.condition,
    limit,
    message: draft.message.trim() === "" ? null : draft.message.trim(),
  };
};

// Whether the draft differs from what the server has. A new draft is always "changed".
export const isDraftChanged = (draft: QuotaDraft, quota: FormQuota | null): boolean => {
  if (!quota) return true;

  return (
    draft.name.trim() !== quota.name ||
    parseLimit(draft.limit) !== quota.limit ||
    draft.message.trim() !== (quota.message ?? "") ||
    JSON.stringify(draft.condition) !== JSON.stringify(quota.condition)
  );
};

// Only the fields that changed: the server counts the quota again when it gets a condition, so an
// unchanged condition must not be sent along with a new name.
export const draftChanges = (
  draft: QuotaDraft,
  quota: FormQuota,
): Partial<FormQuotaInput> | null => {
  const input = draftToInput(draft);

  if (!input) return null;

  const changes: Partial<FormQuotaInput> = {};

  if (input.name !== quota.name) changes.name = input.name;
  if (input.limit !== quota.limit) changes.limit = input.limit;
  if ((input.message ?? null) !== (quota.message ?? null)) changes.message = input.message;
  if (JSON.stringify(input.condition) !== JSON.stringify(quota.condition)) {
    changes.condition = input.condition;
  }

  return changes;
};

export interface QuotaProgress {
  // 0-100, for the bar.
  percent: number;
  full: boolean;
  // The count can pass the limit (a limit lowered after responses came in).
  over: boolean;
}

export const quotaProgress = (quota: Pick<FormQuota, "count" | "limit">): QuotaProgress => ({
  percent: Math.min(100, Math.round((quota.count / Math.max(1, quota.limit)) * 100)),
  full: quota.count >= quota.limit,
  over: quota.count > quota.limit,
});

// Quotas that look at a question that no longer exists in the builder (it was deleted, not saved
// yet) or cannot be used in conditions. The server refuses to save the form in that case.
export const findBrokenQuotas = (
  quotas: readonly FormQuota[],
  questions: readonly Question[],
): string[] => {
  const usable = new Set(conditionTargets(questions).map((q) => q.id));

  return quotas
    .filter((quota) => quota.condition.rules.some((rule) => !usable.has(rule.questionId)))
    .map((quota) => quota.id);
};
