import type { ReactNode } from "react";

interface CardProps {
  title: string;
  subtitle?: string;
  // Top right: a link or a button for the section.
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function Card({ title, subtitle, action, className = "", children }: CardProps) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0 text-sm font-semibold text-indigo-600">{action}</div>}
      </header>
      {children}
    </section>
  );
}

// A block that failed to load: it says so and offers a retry, the rest of the page is unaffected.
export function BlockError({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-700"
    >
      <p>{message}</p>
      <button type="button" onClick={onRetry} className="font-semibold underline cursor-pointer">
        {retryLabel}
      </button>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />
  );
}
