import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUOTA_LIMITS, type FormQuota } from "@quorvia/shared-types";
import { quotasApi, quotasQueryKey } from "../../../api/quotasApi";
import { getApiErrorMessage } from "../../../i18n/errorCodes";
import type { Question } from "../../../types/formBuilder";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import { useToast } from "../../../components/ui/Toast";
import ConditionEditor from "./editors/ConditionEditor";
import { conditionHasEmptyValue, conditionTargets } from "../endRules";
import {
  draftChanges,
  draftFromQuota,
  draftToInput,
  findBrokenQuotas,
  isDraftChanged,
  isDraftComplete,
  newQuotaDraft,
  quotaProgress,
  type QuotaDraft,
} from "../quotas";

// What of a saved quota the author can edit, as a string: two quotas with the same string have the
// same editable state (the count is not editable).
const editableState = (quota: FormQuota): string =>
  JSON.stringify([quota.name, quota.limit, quota.message ?? null, quota.condition]);

interface QuotasEditorProps {
  formId: string;
  // The questions as they are in the builder: only saved ones (with an id) can be used.
  questions: Question[];
}

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const labelClass = "block text-xs font-semibold text-slate-600";

const buttonClass =
  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

interface QuotaCardProps {
  formId: string;
  // null: a quota that was not saved yet.
  quota: FormQuota | null;
  draft: QuotaDraft;
  questions: Question[];
  isBroken: boolean;
  onDraftChange: (draft: QuotaDraft) => void;
  // Called when a new quota was saved or a draft was thrown away.
  onDone: () => void;
}

function QuotaCard({
  formId,
  quota,
  draft,
  questions,
  isBroken,
  onDraftChange,
  onDone,
}: QuotaCardProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const id = useId();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: quotasQueryKey(formId) });
  const onError = (error: unknown) => toast.error(getApiErrorMessage(t, error));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!quota) {
        const input = draftToInput(draft);

        if (!input) throw new Error("incomplete");

        return quotasApi.create(formId, input);
      }

      const changes = draftChanges(draft, quota);

      if (!changes) throw new Error("incomplete");

      return quotasApi.update(formId, quota.id, changes);
    },
    onSuccess: async () => {
      toast.success(t("builder.quotas.saved"));
      await refresh();
      if (!quota) onDone();
    },
    onError,
  });

  const recountMutation = useMutation({
    mutationFn: () => quotasApi.recount(formId, quota!.id),
    onSuccess: async () => {
      toast.success(t("builder.quotas.recounted"));
      await refresh();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => quotasApi.remove(formId, quota!.id),
    onSuccess: async () => {
      setConfirmDelete(false);
      await refresh();
    },
    onError: (error) => {
      setConfirmDelete(false);
      onError(error);
    },
  });

  const complete = isDraftComplete(draft);
  const changed = isDraftChanged(draft, quota);
  const progress = quota ? quotaProgress(quota) : null;
  const busy = saveMutation.isPending || recountMutation.isPending || deleteMutation.isPending;
  const conditionChanged =
    quota !== null && JSON.stringify(draft.condition) !== JSON.stringify(quota.condition);

  const patch = (change: Partial<QuotaDraft>) => onDraftChange({ ...draft, ...change });

  return (
    <div
      role="group"
      aria-label={draft.name.trim() || t("builder.quotas.untitled")}
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <label htmlFor={`${id}-name`} className={labelClass}>
            {t("builder.quotas.name")}
          </label>
          <input
            id={`${id}-name`}
            type="text"
            value={draft.name}
            maxLength={QUOTA_LIMITS.name}
            placeholder={t("builder.quotas.namePlaceholder")}
            onChange={(e) => patch({ name: e.target.value })}
            className={`${inputClass} mt-1`}
          />
        </div>

        <div className="w-32">
          <label htmlFor={`${id}-limit`} className={labelClass}>
            {t("builder.quotas.limit")}
          </label>
          <input
            id={`${id}-limit`}
            type="number"
            inputMode="numeric"
            min={QUOTA_LIMITS.limit.min}
            max={QUOTA_LIMITS.limit.max}
            step={1}
            value={draft.limit}
            onChange={(e) => patch({ limit: e.target.value })}
            className={`${inputClass} mt-1`}
          />
        </div>
      </div>

      {quota && progress && (
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>{t("builder.quotas.progress", { count: quota.count, limit: quota.limit })}</span>
            {progress.full && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                {progress.over ? t("builder.quotas.over") : t("builder.quotas.full")}
              </span>
            )}
          </div>
          <div
            role="progressbar"
            aria-label={t("builder.quotas.progressLabel")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"
          >
            <div
              className={`h-full ${progress.full ? "bg-amber-500" : "bg-indigo-500"}`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      <div>
        <p className={labelClass}>{t("builder.quotas.condition")}</p>
        <ConditionEditor
          mandatory
          condition={draft.condition}
          currentOrder={Infinity}
          allQuestions={questions}
          emptyHint={t("builder.quotas.noTargets")}
          onChange={(condition) => {
            if (condition) patch({ condition });
          }}
        />
      </div>

      {isBroken && (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {t("builder.quotas.broken")}
        </p>
      )}
      {!isBroken && conditionHasEmptyValue(draft.condition) && (
        <p role="alert" className="text-xs font-medium text-amber-700">
          {t("builder.quotas.valueRequired")}
        </p>
      )}
      {quota && conditionChanged && (
        <p className="text-xs text-slate-500">{t("builder.quotas.recountNote")}</p>
      )}

      <div>
        <label htmlFor={`${id}-message`} className={labelClass}>
          {t("builder.quotas.message")}
        </label>
        <textarea
          id={`${id}-message`}
          rows={2}
          value={draft.message}
          maxLength={QUOTA_LIMITS.message}
          placeholder={t("builder.quotas.messagePlaceholder")}
          onChange={(e) => patch({ message: e.target.value })}
          className={`${inputClass} mt-1 border-slate-200`}
        />
        <p className="mt-1 text-xs text-slate-500">{t("builder.quotas.messageHint")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!complete || !changed || busy}
          onClick={() => saveMutation.mutate()}
          className={`${buttonClass} border-indigo-600 bg-indigo-600 text-on-solid hover:bg-indigo-700`}
        >
          {t("builder.quotas.save")}
        </button>

        {quota && (
          <button
            type="button"
            disabled={busy}
            onClick={() => recountMutation.mutate()}
            title={t("builder.quotas.recountHint")}
            className={`${buttonClass} border-slate-200 bg-white text-slate-600 hover:border-slate-300`}
          >
            {t("builder.quotas.recount")}
          </button>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => (quota ? setConfirmDelete(true) : onDone())}
          className={`${buttonClass} ml-auto border-slate-200 bg-white text-rose-600 hover:border-rose-300`}
        >
          {quota ? t("builder.quotas.delete") : t("builder.quotas.discard")}
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmDelete}
        title={t("builder.quotas.deleteModal.title", { name: quota?.name ?? "" })}
        description={t("builder.quotas.deleteModal.description")}
        confirmLabel={t("builder.quotas.deleteModal.confirm")}
        cancelLabel={t("builder.quotas.deleteModal.cancel")}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}

// Quotas: "at most N completed responses from this group" (a condition over the answers). A full
// quota turns away only the respondents it matches; the form stays open for the others. The server
// counts and decides (atomically, when a response arrives); this edits the quotas and shows how full
// they are. Each quota is saved on its own, as a draft, because changing the condition makes the
// server count the responses again.
export default function QuotasEditor({ formId, questions }: QuotasEditorProps) {
  const { t } = useTranslation();

  const {
    data: quotas = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: quotasQueryKey(formId),
    queryFn: () => quotasApi.list(formId),
  });

  // Edits of saved quotas that are not saved yet, by quota id, each with the quota as it was when the
  // edit began; and the one new quota being written.
  const [edits, setEdits] = useState<Record<string, { draft: QuotaDraft; base: string }>>({});
  const [newDraft, setNewDraft] = useState<QuotaDraft | null>(null);

  // The draft to show for a quota. An edit counts only while the quota is still as it was when the
  // edit began: once it changed on the server (saved here, or edited elsewhere) the edit is stale
  // and the card starts over from the server's version. The count is not part of this: it moves
  // with every response and must not throw away what the author is typing.
  const draftFor = (quota: FormQuota): QuotaDraft => {
    const edit = edits[quota.id];

    return edit && edit.base === editableState(quota) ? edit.draft : draftFromQuota(quota);
  };

  const broken = new Set(findBrokenQuotas(quotas, questions));
  const hasTargets = conditionTargets(questions).length > 0;
  const atLimit = quotas.length + (newDraft ? 1 : 0) >= QUOTA_LIMITS.perForm;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">{t("builder.quotas.title")}</p>
        <p className="mt-0.5 text-xs text-slate-500">{t("builder.quotas.hint")}</p>
      </div>

      {isLoading && <p className="text-xs text-slate-500">{t("builder.quotas.loading")}</p>}
      {isError && (
        <p role="alert" className="text-xs font-medium text-rose-600">
          {getApiErrorMessage(t, error)}
        </p>
      )}

      {quotas.map((quota) => (
        <QuotaCard
          key={quota.id}
          formId={formId}
          quota={quota}
          draft={draftFor(quota)}
          questions={questions}
          isBroken={broken.has(quota.id)}
          onDraftChange={(draft) =>
            setEdits((current) => ({
              ...current,
              [quota.id]: { draft, base: editableState(quota) },
            }))
          }
          onDone={() => {}}
        />
      ))}

      {newDraft && (
        <QuotaCard
          formId={formId}
          quota={null}
          draft={newDraft}
          questions={questions}
          isBroken={false}
          onDraftChange={setNewDraft}
          onDone={() => setNewDraft(null)}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!hasTargets || atLimit || newDraft !== null}
          onClick={() => setNewDraft(newQuotaDraft(questions))}
          className={`${buttonClass} border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50`}
        >
          {t("builder.quotas.add")}
        </button>

        {!hasTargets && <p className="text-xs text-slate-500">{t("builder.quotas.noQuestions")}</p>}
        {hasTargets && atLimit && (
          <p className="text-xs text-slate-500">
            {t("builder.quotas.limitReached", { count: QUOTA_LIMITS.perForm })}
          </p>
        )}
      </div>
    </div>
  );
}
