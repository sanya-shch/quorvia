import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ASSET_LIMITS, ErrorCode } from "@quorvia/shared-types";
import { assetUrl, assetsApi } from "../../../api/assets";
import { getApiErrorMessage } from "../../../i18n/errorCodes";

interface LogoUploaderProps {
  formId: string;
  assetId: string | null | undefined;
  onChange: (assetId: string | null) => void;
}

const isAllowedType = (type: string): boolean =>
  (ASSET_LIMITS.allowedMimeTypes as readonly string[]).includes(type);

export default function LogoUploader({ formId, assetId, onChange }: LogoUploaderProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) => assetsApi.uploadLogo(formId, file),
    onSuccess: (asset) => {
      setError(null);
      onChange(asset.id);
    },
    onError: (err) => setError(getApiErrorMessage(t, err)),
  });

  const handleFile = (file: File | undefined) => {
    if (!file) return;

    // The same limits the server enforces, checked first to save a round trip. The server stays
    // the authority: it looks at the real bytes, not at the type the browser reports.
    if (!isAllowedType(file.type)) {
      setError(t(`errors.${ErrorCode.ASSET_INVALID_TYPE}`));
      return;
    }

    if (file.size > ASSET_LIMITS.maxBytes) {
      setError(t(`errors.${ErrorCode.ASSET_TOO_LARGE}`));
      return;
    }

    setError(null);
    upload.mutate(file);
  };

  const hasLogo = Boolean(assetId);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600">{t("builder.logo.label")}</p>
      <p className="text-xs text-slate-500 mt-0.5">{t("builder.logo.hint")}</p>

      <div className="mt-3 flex items-center gap-3">
        {hasLogo && (
          <img
            src={assetUrl(assetId!)}
            alt=""
            className="h-12 max-w-40 rounded-lg border border-slate-200 bg-white object-contain p-1"
          />
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ASSET_LIMITS.allowedMimeTypes.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label={t("builder.logo.input")}
          data-testid="logo-input"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            // Allows choosing the same file again after an error or a removal.
            e.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {upload.isPending
            ? t("builder.logo.uploading")
            : hasLogo
              ? t("builder.logo.replace")
              : t("builder.logo.upload")}
        </button>

        {hasLogo && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              onChange(null);
            }}
            disabled={upload.isPending}
            className="inline-flex items-center rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:text-slate-500 cursor-pointer transition-colors"
          >
            {t("builder.logo.remove")}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
