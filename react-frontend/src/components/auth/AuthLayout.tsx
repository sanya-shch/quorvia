import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import ThemeToggle from "../ui/ThemeToggle";
import AppIcon from "../ui/AppIcon";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-bold text-slate-900">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm text-on-solid"
      >
        <AppIcon name="layers" className="h-5 w-5" />
      </span>
      Quorvia
    </Link>
  );
}

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  // The line under the card.
  footer: string;
  children: ReactNode;
}

// The frame of the sign-in and sign-up pages: logo and language on top, a centered card with a
// small heading, and a one-line caption below. The form itself is the children.
export default function AuthLayout({
  eyebrow,
  title,
  subtitle,
  footer,
  children,
}: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/60">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        <Logo />
        <div className="flex items-center gap-3 sm:gap-5">
          <Link
            to="/"
            className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            {t("auth.backToHome")}
          </Link>
          <LanguageSwitcher size="lg" />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-[30rem] rounded-2xl border border-slate-200 bg-white px-6 py-9 shadow-sm sm:px-9">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            <p className="mx-auto mt-3 max-w-xs text-base leading-relaxed text-slate-500">
              {subtitle}
            </p>
          </div>
          {children}
        </div>
      </main>

      <footer className="px-4 pb-8 text-center text-sm text-slate-500">{footer}</footer>
    </div>
  );
}
