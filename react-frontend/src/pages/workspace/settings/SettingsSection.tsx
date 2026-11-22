import type { ReactNode } from "react";

interface SettingsSectionProps {
  id: string;
  title: string;
  description?: string;
  danger?: boolean;
  children: ReactNode;
}

export default function SettingsSection({
  id,
  title,
  description,
  danger = false,
  children,
}: SettingsSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`scroll-mt-24 rounded-2xl border bg-white p-5 shadow-sm sm:p-6 ${
        danger ? "border-rose-200" : "border-slate-200"
      }`}
    >
      <h2
        id={`${id}-title`}
        className={`text-base font-semibold ${danger ? "text-rose-700" : "text-slate-900"}`}
      >
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}
