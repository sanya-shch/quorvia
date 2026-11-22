import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  normalizeEndRules,
  normalizeEndScreen,
  normalizeScoring,
  normalizeWelcomeScreen,
  type FormTheme,
} from "@quorvia/shared-types";
import { formsApi } from "../../api/forms";
import type { AdminForm, FormState, UpdateFormResult } from "../../types/formBuilder";
import { getApiErrorCode } from "../../i18n/errorCodes";
import { useToast } from "../../components/ui/Toast";
import { useFormBuilder } from "../builder/hooks/useFormBuilder";
import { draftFromScoring, prepareScoring } from "../builder/scoring";
import { prepareEndRules } from "../builder/endRules";
import { questionTypeUsesConfig, questionTypeUsesOptions } from "../builder/questionConfig";

/**
 * The one editable copy of a form for the whole form workspace (Builder, Settings, Overview).
 *
 * It is the former FormBuilder state, lifted into the workspace layout so it survives switching
 * between the workspace tabs: edits made in the Builder are still there (and still unsaved) when
 * the owner opens Settings, and there is exactly one save path with one optimistic lock.
 *
 * There is NO autosave of the form itself (autosave in this project is for respondents' attempts):
 * the owner saves explicitly, and the header says whether there is anything unsaved.
 */
export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

const toDraft = (server: AdminForm): FormState => ({
  title: server.title,
  description: server.description || "",
  responseMode: server.responseMode || "ALL_AT_ONCE",
  questions: server.questions || [],
  defaultLanguage: server.defaultLanguage,
  languages: server.languages ?? [],
  translations: server.translations ?? null,
  logoAssetId: server.logoAssetId ?? null,
  theme: (server.theme as FormTheme | null | undefined) ?? null,
  welcomeScreen: normalizeWelcomeScreen(server.welcomeScreen),
  endScreen: normalizeEndScreen(server.endScreen),
  endRules: normalizeEndRules(server.endRules),
  scoring: draftFromScoring(normalizeScoring(server.scoring)),
  closesAt: server.closesAt ?? null,
  maxResponses: server.maxResponses ?? null,
  responseCount: server.responseCount ?? 0,
});

export function useFormDraft(formId: string) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const builder = useFormBuilder();
  const { form, setForm, resetDirty, markSaved, trySave, revision, isDirty } = builder;

  // The form version the editor currently holds (optimistic lock). Kept outside the form state:
  // changing it must not mark the form dirty or re-render the editor.
  const versionRef = useRef<number | undefined>(undefined);
  const [isConflict, setIsConflict] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // The server copy has been put into the editable draft: until then the draft is the empty
  // default and must not be shown (it would flash an empty form).
  const [isReady, setIsReady] = useState(false);

  const query = useQuery({
    queryKey: ["formAdmin", formId],
    queryFn: () => formsApi.getAdminForm(formId),
    // The editor must not silently replace unsaved edits with server data when returning to the
    // tab; the owner loads the current version deliberately (the conflict dialog).
    refetchOnWindowFocus: false,
  });

  const applyServerForm = useCallback(
    (server: AdminForm) => {
      setForm(toDraft(server));
      versionRef.current = server.version;
      resetDirty();
      setSaveFailed(false);
      setIsReady(true);
    },
    [setForm, resetDirty],
  );

  // The server copy becomes the editable draft whenever a (new) one arrives: that is the point of
  // this effect, a copy of external data into local editable state, not derived state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (query.data) applyServerForm(query.data);
  }, [query.data, applyServerForm]);

  // The mutation variable carries the revision (how many edits there were when the request was
  // sent) and the draft that was sent. After success exactly that revision counts as clean, so
  // edits made during the request stay unsaved.
  const saveMutation = useMutation<
    UpdateFormResult,
    unknown,
    { revision: number; draft: FormState }
  >({
    mutationFn: ({ draft }) => {
      const normalizedQuestions = draft.questions.map((q) => ({
        ...q,
        options: questionTypeUsesOptions(q.type) ? q.options : [],
        config: questionTypeUsesConfig(q.type) ? q.config : null,
      }));

      return formsApi.update(formId, {
        title: draft.title,
        description: draft.description,
        responseMode: draft.responseMode,
        defaultLanguage: draft.defaultLanguage,
        languages: draft.languages,
        translations: draft.translations,
        logoAssetId: draft.logoAssetId,
        theme: draft.theme,
        // A screen the author left incomplete (no title / no text) or a redirect that is not
        // http(s) is not saved; the editor warns about both while typing.
        welcomeScreen:
          draft.welcomeScreen === undefined
            ? undefined
            : normalizeWelcomeScreen(draft.welcomeScreen),
        endScreen: draft.endScreen === undefined ? undefined : normalizeEndScreen(draft.endScreen),
        // Only finished rules are saved (the editor warns about the others); none left -> null.
        endRules: draft.endRules === undefined ? undefined : prepareEndRules(draft.endRules),
        // Only the finished categories are saved; no settings left removes them.
        scoring: draft.scoring === undefined ? undefined : prepareScoring(draft.scoring),
        closesAt: draft.closesAt,
        maxResponses: draft.maxResponses,
        questions: normalizedQuestions,
        version: versionRef.current,
      });
    },
    onSuccess: (result, { revision: sent }) => {
      versionRef.current = result.version;
      markSaved(sent);
      setSaveFailed(false);
      setLastSavedAt(new Date());
      // Lists and the overview read the saved copy; the editor keeps its own draft.
      queryClient.invalidateQueries({ queryKey: ["forms"] });
      toast.success(t("builder.saveSuccess"));
    },
    onError: (error) => {
      const code = getApiErrorCode(error);
      if (code === "FORM_VERSION_CONFLICT") {
        setIsConflict(true);
        return;
      }
      setSaveFailed(true);
      if (
        code === "FORM_INVALID_END_RULES" ||
        code === "FORM_INVALID_FORMULAS" ||
        code === "FORM_INVALID_QUOTAS"
      ) {
        toast.error(t(`errors.${code}`));
        return;
      }
      toast.error(t("builder.saveError"));
    },
  });

  /**
   * Validates and saves. `patch` is applied to the draft first: "Edit details" on the overview
   * saves the new title right away. Returns false when validation stopped the save.
   */
  const save = useCallback(
    (patch?: Partial<FormState>): boolean => {
      let started = false;
      if (patch) builder.updateFormMeta(patch);
      const draft = patch ? { ...form, ...patch } : form;

      trySave(() => {
        started = true;
        saveMutation.mutate({ revision: patch ? revision + 1 : revision, draft });
      }, draft);

      // Validation stopped the save. The problems are on the questions (builder) or in a rule
      // (settings), which may not be on screen now, so say so instead of failing silently.
      if (!started) toast.error(t("workspace.save.invalid"));

      return started;
    },
    [builder, form, revision, saveMutation, trySave, toast, t],
  );

  const loadLatestAfterConflict = useCallback(async () => {
    setIsConflict(false);
    const { data } = await query.refetch();
    if (data) applyServerForm(data);
  }, [query, applyServerForm]);

  const saveState: SaveState = isConflict
    ? "conflict"
    : saveMutation.isPending
      ? "saving"
      : isDirty
        ? saveFailed
          ? "error"
          : "dirty"
        : "saved";

  return {
    ...builder,
    serverForm: query.data,
    isLoading: query.isLoading || (query.isSuccess && !isReady),
    isError: query.isError,
    refetch: query.refetch,
    save,
    saveState,
    isSaving: saveMutation.isPending,
    lastSavedAt,
    isConflict,
    dismissConflict: () => setIsConflict(false),
    loadLatestAfterConflict,
    version: versionRef,
  };
}

export type FormDraft = ReturnType<typeof useFormDraft>;
