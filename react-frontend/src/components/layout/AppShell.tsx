import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authApi } from "../../api/auth";
import { useAuthStore } from "../../store/useAuthStore";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import ThemeToggle from "../ui/ThemeToggle";
import AppIcon, { type AppIconName } from "../ui/AppIcon";
import DemoBanner from "./DemoBanner";

interface AppShellProps {
  // The top bar's left part: the search field on the dashboard, the breadcrumb in a form.
  topBarStart?: ReactNode;
  // Right of the language switcher and the avatar, e.g. "Create form".
  topBarEnd?: ReactNode;
  children: ReactNode;
}

const NAV: { to: string; icon: AppIconName; labelKey: string; end?: boolean }[] = [
  { to: "/dashboard", icon: "grid", labelKey: "shell.nav.dashboard", end: true },
  { to: "/forms", icon: "folder", labelKey: "shell.nav.forms" },
];

const initials = (email: string) => email.slice(0, 2).toUpperCase();

// The frame of the signed-in pages that are not full-screen editors: a sidebar with the
// sections, a top bar and the content. On a phone the sidebar becomes a drawer.
export default function AppShell({ topBarStart, topBarEnd, children }: AppShellProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const logout = () => {
    // The server forgets the session; if that request fails (network) the local logout still
    // has to happen.
    authApi.logout().catch(() => {});
    clearAuth();
    navigate("/login", { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-on-solid"
        >
          <AppIcon name="layers" className="h-5 w-5" />
        </span>
        <span className="text-xl font-bold text-slate-900">Quorvia</span>
      </div>

      <nav aria-label={t("shell.nav.label")} className="flex-1 space-y-1 px-4">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`
            }
          >
            <AppIcon name={item.icon} className="h-5 w-5" />
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700"
          >
            {user ? initials(user.email) : "?"}
          </span>
          <p
            className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700"
            title={user?.email}
          >
            {user?.email}
          </p>
          <button
            type="button"
            onClick={logout}
            title={t("shell.logout")}
            aria-label={t("shell.logout")}
            className="rounded-lg p-2 text-slate-400 transition-colors bg-slate-100 hover:bg-red-100 hover:text-slate-700 cursor-pointer"
          >
            <AppIcon name="close" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-scrim/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[260px] bg-white shadow-xl">{sidebar}</div>
        </div>
      )}

      <div className="min-w-0">
        <DemoBanner />
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={t("shell.openMenu")}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden cursor-pointer"
            >
              <AppIcon name="list" className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">{topBarStart}</div>
            <LanguageSwitcher />
            <ThemeToggle />
            {topBarEnd}
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
