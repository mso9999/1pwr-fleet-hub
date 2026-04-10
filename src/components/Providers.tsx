"use client";

import { usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { TutorialProvider } from "@/components/tutorial/TutorialProvider";
import { AppVersionConsole } from "@/components/AppVersionConsole";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
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
    <AuthProvider>
      <AppVersionConsole />
      <ServiceWorkerRegister />
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
