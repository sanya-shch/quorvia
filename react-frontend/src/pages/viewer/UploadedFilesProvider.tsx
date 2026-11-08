import { useState, type ReactNode } from "react";
import { UploadedFilesContext, type UploadedFilesRegistry } from "./uploadedFilesContext";

// One registry for the whole public form, so the review screen can show the names of files that
// were uploaded on earlier steps.
export default function UploadedFilesProvider({ children }: { children: ReactNode }) {
  const [registry] = useState<UploadedFilesRegistry>(() => new Map());

  return <UploadedFilesContext.Provider value={registry}>{children}</UploadedFilesContext.Provider>;
}
