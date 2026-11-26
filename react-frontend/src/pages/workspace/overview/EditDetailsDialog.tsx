import { useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog from "../../../components/ui/Dialog";

interface EditDetailsDialogProps {
  title: string;
  description: string;
  isSaving: boolean;
  onSave: (values: { title: string; description: string }) => void;
  onClose: () => void;
}

// The form's name and description, edited without opening the builder. They are the main-language
// fields; translations of them are edited in Settings, so there is one place per language.
export default function EditDetailsDialog({
  title,
  description,
  isSaving,
  onSave,
  onClose,
}: EditDetailsDialogProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState({ title, description });
  const invalid = values.title.trim() === "";
  const field =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

  return (
    <Dialog title={t("workspace.details.title")} onClose={onClose} closeLabel={t("common.close")}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) onSave({ title: values.title.trim(), description: values.description });
        }}
      >
        <label className="block text-sm font-semibold text-slate-700">
          {t("workspace.details.formTitle")}
          <input
            autoFocus
            value={values.title}
            maxLength={200}
            aria-invalid={invalid}
            onChange={(e) => setValues({ ...values, title: e.target.value })}
            className={field}
          />
          {invalid && (
            <span role="alert" className="mt-1 block text-xs font-medium text-rose-600">
              {t("workspace.details.titleRequired")}
            </span>
          )}
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          {t("workspace.details.formDescription")}
          <textarea
            rows={4}
            value={values.description}
            onChange={(e) => setValues({ ...values, description: e.target.value })}
            className={field}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={invalid || isSaving}
            className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-on-solid hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? t("workspace.save.saving") : t("workspace.details.save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
