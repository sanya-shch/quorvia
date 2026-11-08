import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ASSET_LIMITS, ErrorCode, IMAGE_CHOICE_LIMITS } from "@quorvia/shared-types";
import type { QuestionOption } from "../../../../types/formBuilder";
import { assetUrl, assetsApi } from "../../../../api/assets";
import { getApiErrorMessage } from "../../../../i18n/errorCodes";

interface ImageOptionsEditorProps {
  formId: string;
  options: QuestionOption[];
  onChange: (options: QuestionOption[]) => void;
}

const isAllowedType = (type: string): boolean =>
  (ASSET_LIMITS.allowedMimeTypes as readonly string[]).includes(type);

const smallButton =
  "rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-800 disabled:text-slate-500 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors";

export default function ImageOptionsEditor({ formId, options, onChange }: ImageOptionsEditorProps) {
  const { t } = useTranslation();
  // Key: option id. A row shows its own upload error.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const setError = (optionId: string, message: string | null) =>
    setErrors((current) => {
      const next = { ...current };

      if (message) next[optionId] = message;
      else delete next[optionId];

      return next;
    });

  const patch = (optionId: string, change: Partial<QuestionOption>) =>
    onChange(options.map((option) => (option.id === optionId ? { ...option, ...change } : option)));

  const upload = useMutation({
    mutationFn: ({ file }: { optionId: string; file: File }) => assetsApi.uploadOptionImage(formId, file),
    onSuccess: (asset, { optionId }) => {
      setError(optionId, null);
      patch(optionId, { imageAssetId: asset.id });
    },
    onError: (err, { optionId }) => setError(optionId, getApiErrorMessage(t, err)),
  });

  const handleFile = (optionId: string, file: File | undefined) => {
    if (!file) return;

    // The same limits the server enforces (it looks at the real bytes); checked first to save a request.
    if (!isAllowedType(file.type)) {
      setError(optionId, t(`errors.${ErrorCode.ASSET_INVALID_TYPE}`));
      return;
    }

    if (file.size > ASSET_LIMITS.maxBytes) {
      setError(optionId, t(`errors.${ErrorCode.ASSET_TOO_LARGE}`));
      return;
    }

    setError(optionId, null);
    upload.mutate({ optionId, file });
  };

  const move = (index: number, delta: -1 | 1) => {
    const next = [...options];
    const target = index + delta;

    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  const addOption = () =>
    onChange([
      ...options,
      {
        id: `opt-${Date.now()}-${options.length}`,
        text: t("builder.imageOptions.defaultLabel", { number: options.length + 1 }),
        isDefault: false,
      },
    ]);

  const removeOption = (optionId: string) => {
    setError(optionId, null);
    onChange(options.filter((option) => option.id !== optionId));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {t("builder.imageOptions.hint", { min: IMAGE_CHOICE_LIMITS.minOptions, max: IMAGE_CHOICE_LIMITS.maxOptions })}
      </p>

      <ul className="space-y-3">
        {options.map((option, index) => {
          const number = index + 1;
          const isUploading = upload.isPending && upload.variables?.optionId === option.id;
          const error = errors[option.id];

          return (
            <li key={option.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {option.imageAssetId ? (
                    <img src={assetUrl(option.imageAssetId)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-1 text-center text-[10px] font-medium text-slate-500">
                      {t("builder.imageOptions.noPicture")}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    type="text"
                    value={option.text}
                    aria-label={t("builder.imageOptions.label", { number })}
                    placeholder={t("builder.imageOptions.labelPlaceholder")}
                    onChange={(e) => patch(option.id, { text: e.target.value })}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />

                  <div className="flex flex-wrap items-center gap-1">
                    <input
                      ref={(element) => {
                        fileInputs.current[option.id] = element;
                      }}
                      type="file"
                      accept={ASSET_LIMITS.allowedMimeTypes.join(",")}
                      className="sr-only"
                      tabIndex={-1}
                      aria-label={t("builder.imageOptions.fileInput", { number })}
                      data-testid={`option-image-input-${option.id}`}
                      onChange={(e) => {
                        handleFile(option.id, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => fileInputs.current[option.id]?.click()}
                      className={smallButton}
                    >
                      {isUploading
                        ? t("builder.imageOptions.uploading")
                        : option.imageAssetId
                          ? t("builder.imageOptions.replace", { number })
                          : t("builder.imageOptions.add", { number })}
                    </button>

                    {option.imageAssetId && (
                      <button
                        type="button"
                        onClick={() => patch(option.id, { imageAssetId: null })}
                        className={smallButton}
                      >
                        {t("builder.imageOptions.removePicture", { number })}
                      </button>
                    )}

                    <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />

                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={t("builder.imageOptions.moveUp", { number })}
                      className={smallButton}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === options.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={t("builder.imageOptions.moveDown", { number })}
                      className={smallButton}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={options.length <= IMAGE_CHOICE_LIMITS.minOptions}
                      onClick={() => removeOption(option.id)}
                      className={`${smallButton} text-rose-600 hover:text-rose-700`}
                    >
                      {t("builder.imageOptions.remove", { number })}
                    </button>
                  </div>

                  {error && (
                    <p role="alert" className="text-xs font-medium text-rose-600">
                      {error}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={options.length >= IMAGE_CHOICE_LIMITS.maxOptions}
        onClick={addOption}
        className="inline-flex items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        {t("builder.imageOptions.addOption")}
      </button>
    </div>
  );
}
