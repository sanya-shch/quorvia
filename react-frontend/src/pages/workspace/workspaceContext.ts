import { createContext, useContext } from "react";
import type { FormDraft } from "./useFormDraft";

export const WorkspaceContext = createContext<FormDraft | null>(null);

// The editable copy of the current form, shared by every page of the form workspace.
export const useWorkspace = (): FormDraft => {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside the form workspace");
  return value;
};
