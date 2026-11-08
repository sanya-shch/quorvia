import { createContext, useContext, useState } from "react";
import type { UploadedFileDto } from "@quorvia/shared-types";

// What the respondent has uploaded so far: id -> name/size. The answer to a FILE question is only
// the list of ids (that is what the server needs), so the names shown in the field and on the
// review screen are kept here. A plain Map: it is only read while rendering after an answer
// change, so it does not need to be reactive itself.
export type UploadedFilesRegistry = Map<string, UploadedFileDto>;

export const UploadedFilesContext = createContext<UploadedFilesRegistry | null>(null);

// Without a provider (a field rendered on its own) the field keeps a registry of its own.
export const useUploadedFiles = (): UploadedFilesRegistry => {
  const shared = useContext(UploadedFilesContext);
  const [local] = useState<UploadedFilesRegistry>(() => new Map());

  return shared ?? local;
};
