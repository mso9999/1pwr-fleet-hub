"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { navDataTutorialHref } from "@/lib/tutorial-steps";
import { canViewEhsApprovedDrivers } from "@/lib/fleet-roles";
import { TutorialLaunchButton } from "@/components/tutorial/TutorialLaunchButton";
import { useLocaleContext } from "@/i18n/locale-context";
import { LanguageToggle } from "@/components/LanguageToggle";

const NAV_ITEMS = [
  { href: "/", labelKey: "nav.dashboard", icon: "grid" },
  { href: "/map", labelKey: "nav.fleetMap", icon: "map" },
  { href: "/vehicles", labelKey: "nav.vehicles", icon: "truck" },
  { href: "/trips", labelKey: "nav.trips", icon: "route" },
  { href: "/vehicle-checks", labelKey: "nav.vehicleChecks", icon: "shield" },
  { href: "/ehs-approved-drivers", labelKey: "nav.ehsApprovedDrivers", icon: "idCard" },
  { href: "/work-orders", labelKey: "nav.workOrders", icon: "wrench" },
  { href: "/maintenance", labelKey: "nav.maintenance", icon: "calendar" },
  { href: "/mechanics", labelKey: "nav.mechanics", icon: "users" },
  { href: "/triage", labelKey: "nav.triage", icon: "scale" },
  { href: "/vehicle-requests", labelKey: "nav.requests", icon: "inbox" },
  { href: "/vehicle-country-changes", labelKey: "nav.countryTransfers", icon: "globe" },
  {
    href: "/personal-vehicle-reimbursement",
    labelKey: "nav.personalVehicleReimbursement",
    icon: "wallet",
  },
  { href: "/daily-update", labelKey: "nav.dailyUpdate", icon: "document" },
  { href: "/tco", labelKey: "nav.tcoAnalytics", icon: "trending" },
  { href: "/reports", labelKey: "nav.reports", icon: "chart" },
  { href: "/inspections", labelKey: "nav.inspections", icon: "clipboard" },
  { href: "/guide", labelKey: "nav.userGuide", icon: "book" },
  { href: "/report-issue", labelKey: "nav.reportIssue", icon: "alert" },
  { href: "/admin", labelKey: "nav.admin", icon: "settings" },
] as const;

function navItemMatchesPath(
  pathname: string,
  item: (typeof NAV_ITEMS)[number]
): boolean {
  return (
    item.href === pathname ||
    (item.href !== "/" &&
      (item.href === "/guide" ? pathname.startsWith("/guide") : pathname.startsWith(item.href)))
  );
}

function navItemVisible(
  item: (typeof NAV_ITEMS)[number],
  user: { role: string; department?: string } | null
): boolean {
  if (item.href === "/ehs-approved-drivers") {
    return !!user && canViewEhsApprovedDrivers(user.role, user.department);
  }
  return true;
}

function NavIcon({ icon, className }: { icon: string; className?: string }): React.ReactElement {
  const c = cn("w-5 h-5", className);
  switch (icon) {
    case "grid":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
    case "map":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "truck":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10m10 0h4m0 0a1 1 0 001-1v-3.5a1 1 0 00-.3-.7l-3-3A1 1 0 0014 8h-1v8z" />
        </svg>
      );
    case "route":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      );
    case "wrench":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "shield":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "inbox":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      );
    case "wallet":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      );
    case "trending":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      );
    case "idCard":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 012-2h4a2 2 0 012 2v1m-4 0a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2v0a2 2 0 012-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 14h.01M12 14h.01M16 14h.01M8 18h8" />
        </svg>
      );
    case "clipboard":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case "alert":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
    case "users":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case "settings":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      );
    case "scale":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M6 6v12a2 2 0 002 2h8a2 2 0 002-2V6M9 10h6M9 14h4" />
        </svg>
      );
    case "document":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "chart":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    case "book":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "globe":
      return (
        <svg className={c} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return <span className={c} />;
  }
}

interface OrgOption { id: string; name: string; code: string; }

export function AppShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { user, organizationId, setOrganizationId, signOut } = useAuth();
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const { t } = useLocaleContext();

  useEffect(() => {
    fetch("/api/organizations").then((r) => r.json()).then(setOrgs).catch(() => {});
  }, []);

  const visibleNavItems = NAV_ITEMS.filter((i) => navItemVisible(i, user));
  const navMatch = visibleNavItems.find((i) => navItemMatchesPath(pathname, i));
  const pageTitle = pathname.startsWith("/ehs-approved-drivers")
    ? t("header.ehsApprovedDrivers")
    : pathname.startsWith("/guide/inspections")
    ? t("header.guideInspections")
    : pathname.startsWith("/guide/getting-started")
      ? t("header.guideGettingStarted")
      : pathname.startsWith("/guide/daily-workflows")
        ? t("header.guideDailyWorkflows")
        : pathname.startsWith("/guide/vehicle-checks")
          ? t("header.guideVehicleChecks")
          : pathname.startsWith("/guide/fleet-and-map")
            ? t("header.guideFleetAndMap")
            : pathname.startsWith("/guide/maintenance-and-work")
              ? t("header.guideMaintenanceAndWork")
              : pathname.startsWith("/guide/insights-and-field")
                ? t("header.guideInsightsAndField")
                : pathname.startsWith("/guide")
                  ? t("header.guide")
                  : navMatch
                    ? t(navMatch.labelKey)
                    : t("nav.dashboard");

  return (
    <div className="flex h-screen overflow-hidden">
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-800 text-slate-200 transition-transform duration-200 md:relative md:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-slate-700 px-5">
          <Image src="/logo.png" alt="1PWR" width={36} height={36} className="rounded-lg" />
          <div>
            <div className="font-semibold text-white text-sm">{t("brand.title")}</div>
            <div className="text-xs text-slate-400">{t("brand.subtitle")}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {visibleNavItems.map((item) => {
              const isActive = navItemMatchesPath(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-tutorial={navDataTutorialHref(item.href)}
                    onClick={() => setIsMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-blue-600/20 text-blue-400"
                        : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    )}
                  >
                    <NavIcon icon={item.icon} />
                    {t(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-slate-700 p-4 space-y-3">
          {orgs.length > 1 && (
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              className="w-full rounded-lg bg-slate-700 text-slate-200 text-xs px-2 py-1.5 border-none focus:ring-1 focus:ring-blue-500"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">{t("auth.signedInAs")}</div>
              <div className="text-sm font-medium text-slate-300 truncate max-w-[140px]">
                {user?.name || user?.email || "—"}
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-700"
            >
              {t("auth.signOut")}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b border-zinc-200 bg-white px-4 md:px-6">
          <button
            type="button"
            data-tutorial="header-menu"
            onClick={() => setIsMobileOpen(true)}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 md:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-zinc-900 flex-1">{pageTitle}</h1>
          <div className="flex items-center gap-3 shrink-0">
            <LanguageToggle />
            <TutorialLaunchButton />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6" data-tutorial="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
