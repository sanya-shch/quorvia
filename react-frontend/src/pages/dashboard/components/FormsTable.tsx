import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AppIcon from "../../../components/ui/AppIcon";
import { type FormSummary } from "../../../types/form";
import { getPublicationStatus } from "../../workspace/formStatus";
import StatusBadge from "../../workspace/StatusBadge";
import FormCard from "./FormCard";

type Filter = "all" | "draft" | "published";
type Sort = "updated" | "created" | "responses" | "title";

interface FormsTableProps {
  forms: FormSummary[];
  // Dashboard: a few rows and "View all forms"; My Forms: all of them.
  limit?: number;
  query: string;
  onDelete: (form: FormSummary) => void;
  onTogglePublish: (form: FormSummary) => void;
  onDuplicate: (form: FormSummary) => void;
}

const SORTS: Sort[] = ["updated", "created", "responses", "title"];

// The user's forms as a table (or as cards): filter by publication, sort, switch the view. The
// row opens the form's workspace; the gear opens its settings. Nothing is loaded here: the page
// that owns the list passes it in, so the dashboard and "My forms" are the same component.
export default function FormsTable({
  forms,
  limit,
  query,
  onDelete,
  onTogglePublish,
  onDuplicate,
}: FormsTableProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [view, setView] = useState<"list" | "grid">("list");

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? forms.filter(
          (f) => f.title.toLowerCase().includes(q) || f.description?.toLowerCase().includes(q),
        )
      : forms;
  }, [forms, query]);

  const counts = {
    all: searched.length,
    draft: searched.filter((f) => !f.isPublished).length,
    published: searched.filter((f) => f.isPublished).length,
  };

  const visible = useMemo(() => {
    const filtered = searched.filter((f) =>
      filter === "all" ? true : filter === "published" ? f.isPublished : !f.isPublished,
    );
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case "created":
          return b.createdAt.localeCompare(a.createdAt);
        case "responses":
          return b._count.responses - a._count.responses;
        case "title":
          return a.title.localeCompare(b.title, i18n.language);
        default:
          return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
    return limit ? sorted.slice(0, limit) : sorted;
  }, [searched, filter, sort, limit, i18n.language]);

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(iso));

  const shownCount = visible.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={t("dashboard.table.filter")}
          className="inline-flex rounded-xl bg-slate-100 p-1"
        >
          {(["all", "draft", "published"] as Filter[]).map((value) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer ${
                filter === value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t(`dashboard.table.filters.${value}`)}
              <span className="ml-1.5 text-xs font-medium text-slate-400">{counts[value]}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center">
            <span className="sr-only">{t("dashboard.table.sort")}</span>
            <AppIcon
              name="filter"
              className="pointer-events-none absolute left-2.5 h-4 w-4 text-slate-500"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-9 cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-sm font-semibold text-slate-700"
            >
              {SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`dashboard.table.sorts.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <div
            role="group"
            aria-label={t("dashboard.table.view")}
            className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5"
          >
            {(["list", "grid"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                aria-label={t(`dashboard.table.views.${value}`)}
                onClick={() => setView(value)}
                className={`rounded-lg p-2 cursor-pointer ${view === value ? "bg-indigo-50 text-indigo-700" : "text-slate-500"}`}
              >
                <AppIcon name={value === "list" ? "list" : "grid"} className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {shownCount === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">
          {query.trim() ? t("dashboard.table.noMatches") : t("dashboard.table.empty")}
        </p>
      ) : view === "grid" ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((form) => (
            <FormCard
              key={form.id}
              form={form}
              onClick={() => navigate(`/forms/${form.id}/overview`)}
              onDelete={() => onDelete(form)}
              onTogglePublish={() => onTogglePublish(form)}
              onDuplicate={() => onDuplicate(form)}
              onAnalytics={() => navigate(`/forms/${form.id}/analytics`)}
            />
          ))}
        </div>
      ) : (
        <div className="-mx-5 mt-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold sm:px-6">{t("dashboard.table.form")}</th>
                <th className="px-3 py-3 font-semibold">{t("dashboard.table.status")}</th>
                <th className="px-3 py-3 font-semibold">{t("dashboard.table.questions")}</th>
                <th className="px-3 py-3 font-semibold">{t("dashboard.table.responses")}</th>
                <th className="px-3 py-3 font-semibold">{t("dashboard.table.updated")}</th>
                <th className="px-5 py-3 sm:px-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((form) => {
                const status = getPublicationStatus({
                  isPublished: form.isPublished,
                  responseCount: form._count.responses,
                });
                return (
                  <tr key={form.id} className="hover:bg-slate-50/60">
                    <td className="max-w-xs px-5 py-4 sm:px-6">
                      <Link
                        to={`/forms/${form.id}/overview`}
                        className="block font-semibold text-slate-900 hover:text-indigo-700"
                      >
                        <span className="block truncate">{form.title}</span>
                      </Link>
                      {form.description && (
                        <span className="block truncate text-xs text-slate-500">
                          {form.description}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-3 py-4 text-slate-700">{form._count.questions}</td>
                    <td className="px-3 py-4">
                      {form._count.responses > 0 ? (
                        <Link
                          to={`/forms/${form.id}/responses`}
                          className="font-semibold text-indigo-600 hover:underline"
                        >
                          {form._count.responses}
                        </Link>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-slate-500">{date(form.updatedAt)}</td>
                    <td className="px-5 py-4 text-right sm:px-6">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/forms/${form.id}/${status === "draft" ? "builder" : "overview"}`}
                          className="font-semibold text-indigo-600 hover:underline"
                        >
                          {status === "draft"
                            ? t("dashboard.table.edit")
                            : t("dashboard.table.open")}
                        </Link>
                        <Link
                          to={`/forms/${form.id}/settings`}
                          aria-label={t("dashboard.table.settings", { title: form.title })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <AppIcon name="settings" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {limit !== undefined && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>{t("dashboard.table.showing", { shown: shownCount, total: counts[filter] })}</span>
          <Link to="/forms" className="font-semibold text-indigo-600 hover:underline">
            {t("dashboard.table.viewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}
