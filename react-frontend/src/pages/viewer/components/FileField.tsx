import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorCode, FILE_LIMITS } from "@quorvia/shared-types";
import { deleteResponseFile, uploadResponseFile } from "../../../api/publicFormApi";
import { getApiErrorCode, translateErrorCode } from "../../../i18n/errorCodes";
import { type Question } from "../../../types/formBuilder";
import { type AnswerValue } from "../../../types/formViewer";
import { useUploadedFiles } from "../uploadedFilesContext";

interface FileFieldProps {
  question: Question;
  qId: string;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  shareId?: string;
  sessionKey?: string;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
}

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
};

// The browser's type, or (when it reports none, as for some .txt files) the extension's.
const typeOf = (file: File): string =>
  file.type || EXTENSION_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] || "";

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const ACCEPT = Object.keys(EXTENSION_TYPES)
  .map((extension) => `.${extension}`)
  .join(",");

export default function FileField({
  question,
  qId,
  value,
  onChange,
  shareId,
  sessionKey,
  labelledBy,
  describedBy,
  invalid,
}: FileFieldProps) {
  const { t } = useTranslation();
  const registry = useUploadedFiles();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);

  const ids = Array.isArray(value) ? value : [];
  const maxFiles = question.config?.maxFiles ?? 1;
  const canAdd = Boolean(shareId && sessionKey) && ids.length < maxFiles && !uploading;
  const busy = uploading !== null || removing !== null;

  const errorText = (code: string) => translateErrorCode(t, code);

  const handleFiles = async (selected: FileList | null) => {
    if (!selected || selected.length === 0 || !shareId || !sessionKey) return;

    const problems: string[] = [];
    const current = [...ids];
    const queue = Array.from(selected);

    if (queue.length > maxFiles - current.length) {
      problems.push(errorText(ErrorCode.FILE_LIMIT_REACHED));
    }

    for (const file of queue.slice(0, Math.max(0, maxFiles - current.length))) {
      // The same limits the server enforces (it looks at the real bytes); checked first so an
      // obviously wrong file does not travel over the network.
      if (!(FILE_LIMITS.allowedMimeTypes as readonly string[]).includes(typeOf(file))) {
        problems.push(`${file.name}: ${errorText(ErrorCode.FILE_INVALID_TYPE)}`);
        continue;
      }

      if (file.size > FILE_LIMITS.maxBytes) {
        problems.push(`${file.name}: ${errorText(ErrorCode.FILE_TOO_LARGE)}`);
        continue;
      }

      setUploading(file.name);

      try {
        const uploaded = await uploadResponseFile(shareId, { sessionKey, questionId: qId, file });

        registry.set(uploaded.id, uploaded);
        current.push(uploaded.id);
        onChange([...current]);
      } catch (err) {
        problems.push(
          `${file.name}: ${errorText(getApiErrorCode(err) ?? ErrorCode.FILE_UPLOAD_INVALID)}`,
        );
      }
    }

    setUploading(null);
    setMessages(problems);
  };

  const handleRemove = async (id: string) => {
    if (!shareId || !sessionKey) return;

    setRemoving(id);
    setMessages([]);

    try {
      await deleteResponseFile(shareId, sessionKey, id);
    } catch (err) {
      // Already gone on the server: the file is not usable anyway, so drop it from the answer too.
      if (getApiErrorCode(err) !== ErrorCode.FILE_NOT_FOUND) {
        setMessages([errorText(getApiErrorCode(err) ?? ErrorCode.FILE_UPLOAD_INVALID)]);
        setRemoving(null);
        return;
      }
    }

    registry.delete(id);
    onChange(ids.filter((existing) => existing !== id));
    setRemoving(null);
  };

  return (
    <div className="space-y-3" aria-describedby={describedBy}>
      <input
        ref={inputRef}
        type="file"
        id={qId}
        accept={ACCEPT}
        multiple={maxFiles > 1}
        className="sr-only"
        tabIndex={-1}
        aria-labelledby={labelledBy}
        aria-invalid={invalid}
        data-testid={`file-input-${qId}`}
        onChange={(e) => {
          void handleFiles(e.target.files);
          // Allows choosing the same file again after an error or a removal.
          e.target.value = "";
        }}
      />

      {ids.length > 0 && (
        <ul className="space-y-2">
          {ids.map((id) => {
            const file = registry.get(id);

            return (
              <li
                key={id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-surface px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                  {file?.name ?? id}
                </span>
                {file && <span className="text-xs text-slate-500">{formatSize(file.size)}</span>}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRemove(id)}
                  aria-label={t("viewer.file.remove", { name: file?.name ?? id })}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 cursor-pointer"
                >
                  {t("viewer.file.removeShort")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => inputRef.current?.click()}
          aria-describedby={`${qId}-file-hint`}
          className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-surface px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {uploading
            ? t("viewer.file.uploading", { name: uploading })
            : ids.length > 0
              ? t("viewer.file.addMore")
              : t("viewer.file.choose")}
        </button>

        <span id={`${qId}-file-hint`} className="text-xs text-slate-500">
          {t("viewer.file.hint", { count: maxFiles, size: FILE_LIMITS.maxBytes / (1024 * 1024) })}
        </span>
      </div>

      <div aria-live="polite" className="space-y-1">
        {messages.map((message) => (
          <p key={message} role="alert" className="text-xs font-medium text-rose-600">
            {message}
          </p>
        ))}
      </div>
    </div>
  );
}
