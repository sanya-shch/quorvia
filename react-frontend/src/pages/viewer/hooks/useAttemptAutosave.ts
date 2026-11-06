import { useEffect, useRef } from "react";
import { saveFormAttempt } from "../../../api/publicFormApi";
import type { FormAnswers } from "../../../types/formViewer";

const AUTOSAVE_DEBOUNCE_MS = 1200;

/**
 * Debounced autosave of a session "draft": records the respondent's progress even if they never
 * submit, so funnel analytics (backend: buildFormFunnel) sees real abandoned sessions, not just
 * completed submits.
 *
 * reachedQuestionIds are the ids of questions the respondent really saw (sent only by the
 * step-by-step mode, where "visible by conditions" and "shown on screen" differ). Without it the
 * server treats every currently visible question as reached, which is right for the all-at-once
 * mode. The list is part of the debounce key, so moving to the next step without changing an
 * answer (skipping an optional question) is saved too.
 *
 * Called from both FormViewer and QuestionStepper (each owns its own `answers` state), so it is a
 * standalone hook rather than state lifted into PublicFormPage.
 *
 * Autosave is best-effort: a failure is ignored silently (the respondent must not be interrupted
 * for a lost funnel snapshot), and the initial (even empty) state is saved after the debounce
 * pause too, which records "reached at least the first question" for someone who saw the form and
 * left without typing anything.
 *
 * Known limitation: there is no sendBeacon flush on beforeunload/pagehide, so the last few seconds
 * before closing the tab may miss the draft if the respondent left faster than the debounce pause.
 * Periodic autosave still gives meaningful funnel data; this is a deliberate trade-off.
 */
export function useAttemptAutosave(
  shareId: string | undefined,
  sessionKey: string,
  answers: FormAnswers,
  reachedQuestionIds?: string[],
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    if (!shareId) return;

    const serialized = JSON.stringify({ answers, reachedQuestionIds });
    if (serialized === lastSavedRef.current) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      lastSavedRef.current = serialized;
      saveFormAttempt(shareId, sessionKey, answers, reachedQuestionIds).catch(() => {
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [shareId, sessionKey, answers, reachedQuestionIds]);
}
