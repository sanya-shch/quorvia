import type { ExportFormat, ExportJobDto } from "@quorvia/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Dialog from "../../../components/ui/Dialog";
import { useToast } from "../../../components/ui/Toast";
import { workspaceApi } from "../../../api/workspaceApi";
import AppIcon from "../../../components/ui/AppIcon";

const FORMATS: ExportFormat[] = ["CSV", "EXCEL", "PDF"];
const ACTIVE = new Set(["PENDING", "PROCESSING"]);

// Starts an export and shows its real status. It is the same asynchronous job the responses
// page uses: the server builds the file in the background and this list polls until it is ready,
// so nothing blocks while a large export is processed.
export default function ExportDialog({ formId, onClose }: { formId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  const jobs = useQuery({
    queryKey: ["exports", formId],
    queryFn: () => workspaceApi.listExports(formId),
    // Poll only while something is still being built.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((j) => ACTIVE.has(j.status)) ? 2000 : false,
  });

  const create = useMutation({
    mutationFn: (format: ExportFormat) => workspaceApi.createExport(formId, format),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exports", formId] }),
    onError: () => toast.error(t("workspace.export.failed")),
  });

  const download = useMutation({
    mutationFn: (job: ExportJobDto) => workspaceApi.downloadExport(formId, job.id),
    onError: () => toast.error(t("workspace.export.downloadFailed")),
  });

  const time = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(
      new Date(iso),
    );

  return (
    <Dialog
      title={t("workspace.export.title")}
      description={t("workspace.export.description")}
      onClose={onClose}
      closeLabel={t("common.close")}
      width="lg"
    >
      <div className="grid grid-cols-3 gap-2">
        {FORMATS.map((format) => (
          <button
            key={format}
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate(format)}
            className="rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50 cursor-pointer"
          >
            {t(`workspace.export.formats.${format}`)}
          </button>
        ))}
      </div>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t("workspace.export.history")}
      </h3>
      {jobs.isLoading ? (
        <p className="py-6 text-center text-sm text-slate-400">{t("workspace.loading")}</p>
      ) : (jobs.data ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">{t("workspace.export.empty")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {(jobs.data ?? []).slice(0, 6).map((job) => (
            <li key={job.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">
                  {t(`workspace.export.formats.${job.format}`)}
                </p>
                <p className="text-xs text-slate-400">{time(job.createdAt)}</p>
              </div>
              <span
                className={`text-xs font-semibold ${
                  job.status === "FAILED"
                    ? "text-rose-600"
                    : job.status === "COMPLETED"
                      ? "text-emerald-600"
                      : "text-amber-600"
                }`}
              >
                {t(`workspace.export.status.${job.status}`)}
              </span>
              {job.status === "COMPLETED" && (
                <button
                  type="button"
                  disabled={download.isPending}
                  onClick={() => download.mutate(job)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <AppIcon name="download" className="h-3.5 w-3.5" />
                  {t("workspace.export.download")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
