import { createContext, useContext } from "react";

// What the server told the respondent about a quota that is full: only the owner's message for the
// respondent (null: the standard text), never anything about the quota itself.
export interface QuotaFullInfo {
  message: string | null;
}

// The autosave learns, while the respondent is still filling the form, that the answers so far fall
// into a quota that is full. The form components own the autosave, the page owns the screen, so the
// news travels through a context instead of through props of both form components. Without a
// provider (the autosave in isolation) it goes nowhere.
export const QuotaWarningContext = createContext<(info: QuotaFullInfo | null) => void>(() => {});

export const useReportQuotaStatus = () => useContext(QuotaWarningContext);
