import { useEffect, useMemo, useRef, useState } from "react";
import { useReportQuotaStatus } from "../quotaWarning";
import { saveFormAttempt } from "../../../api/publicFormApi";
import type { FormAnswers } from "../../../types/formViewer";

const AUTOSAVE_DEBOUNCE_MS = 1200;

// What the respondent is told about their progress: nothing saved yet (the form says it saves
// automatically), a save in flight, or the current answers are on the server.
export type SaveStatus = "idle" | "saving" | "saved";

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
 * The answer to a save may say that the answers so far fall into a quota that is full; that is
 * reported (and cleared again when a later save says otherwise) so the page can warn the
 * respondent before they reach the end. Only the answer to the latest request counts: a slower,
 * older one must not bring back a warning that a newer one has already cleared.
 *
 * The hook returns the save status for the "All answers saved" indicator. "saved" means the LAST
 * successful save holds exactly the current answers, so typing again drops it back to "idle"
 * until the next save lands; a failed save is not reported (the respondent keeps working).
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
  const requestRef = useRef(0);
  const reportQuotaStatus = useReportQuotaStatus();
  const [isSaving, setIsSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const snapshot = useMemo(
    () => JSON.stringify({ answers, reachedQuestionIds }),
    [answers, reachedQuestionIds],
  );

  useEffect(() => {
    if (!shareId) return;

    const serialized = snapshot;
    if (serialized === lastSavedRef.current) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      lastSavedRef.current = serialized;
      const request = ++requestRef.current;
      setIsSaving(true);

      saveFormAttempt(shareId, sessionKey, answers, reachedQuestionIds)
        .then((result) => {
          if (request !== requestRef.current) return;

          reportQuotaStatus(result?.quotaFull ?? null);
          setSavedSnapshot(serialized);
          setIsSaving(false);
        })
        .catch(() => {
          if (request === requestRef.current) setIsSaving(false);
        });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [shareId, sessionKey, answers, reachedQuestionIds, snapshot, reportQuotaStatus]);

  const status: SaveStatus = isSaving ? "saving" : savedSnapshot === snapshot ? "saved" : "idle";

  return { status };
}
