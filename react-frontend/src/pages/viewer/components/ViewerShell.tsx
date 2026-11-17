import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface ViewerShellProps {
  // The form title next to the mark in the header.
  title: string;
  // Right side of the header: the save status, the language switcher.
  headerRight?: ReactNode;
  // 0-100: draws a thin progress bar under the header. Omitted: no bar.
  progress?: number;
  progressLabel?: string;
  // A banner above the content (the quota warning).
  notice?: ReactNode;
  // Centers the content vertically (welcome, closing and thank-you screens).
  centered?: boolean;
  // Width of the content column.
  width?: "md" | "lg" | "xl";
  children: ReactNode;
}

const WIDTHS = { md: "max-w-md", lg: "max-w-xl", xl: "max-w-2xl" } as const;

// The frame of every public form page: a header with the form name, the content column and a
// footer. It uses only the palette classes the form theme re-points (slate, indigo, surface), so
// a themed form keeps its colors here too.
export default function ViewerShell({
  title,
  headerRight,
  progress,
  progressLabel,
  notice,
  centered = false,
  width = "xl",
  children,
}: ViewerShellProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-on-primary"
            >
              Q
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
              <p className="truncate text-xs text-slate-500">{t("viewer.header.formLabel")}</p>
            </div>
          </div>
          {headerRight && <div className="flex shrink-0 items-center gap-3">{headerRight}</div>}
        </div>

        {progress !== undefined && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={progressLabel}
            className="h-1 w-full bg-slate-200"
          >
            <div
              className="h-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </header>

      <main
        className={`mx-auto flex w-full flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10 ${WIDTHS[width]} ${
          centered ? "justify-center" : ""
        }`}
      >
        {notice}
        {children}
      </main>

      <footer className="border-t border-slate-200 bg-surface">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>{t("viewer.footer.privacy")}</p>
          <p>{t("viewer.footer.poweredBy")}</p>
        </div>
      </footer>
    </div>
  );
}
