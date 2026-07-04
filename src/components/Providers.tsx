"use client";

import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { TutorialProvider } from "@/components/tutorial/TutorialProvider";
import { AppVersionConsole } from "@/components/AppVersionConsole";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { LocaleProvider, useLocaleContext } from "@/i18n/locale-context";
import { LocaleHtmlLang } from "@/components/LocaleHtmlLang";

function AuthLoadingScreen(): React.ReactElement {
  const { t } = useLocaleContext();
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-3" />
        <p className="text-slate-500 text-sm">{t("common.loading")}</p>
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  if (pathname === "/login" || pathname === "/sso") {
    return <>{children}</>;
  }

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    if (typeof window !== "undefined") {
      // Emergency fallback (?fallback=1) keeps the local login form reachable
      // (e.g. Nexus outage). Normal path is centralized auth at Nexus, which
      // SSOs back to /sso (signInWithCustomToken receiver).
      const params = new URLSearchParams(window.location.search);
      if (params.get("fallback") === "1") {
        window.location.href = "/login?fallback=1";
      } else {
        window.location.replace(
          "https://nexus.1pwrafrica.com/sso/authorize?tool=fm&redirect_uri=" +
            encodeURIComponent("https://fm.1pwrafrica.com/sso")
        );
      }
    }
    return null;
  }

  return (
    <TutorialProvider>
      <AppShell>{children}</AppShell>
    </TutorialProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <LocaleHtmlLang />
      <AuthProvider>
        <AppVersionConsole />
        <ServiceWorkerRegister />
        <AuthGate>{children}</AuthGate>
      </AuthProvider>
    </LocaleProvider>
  );
}
