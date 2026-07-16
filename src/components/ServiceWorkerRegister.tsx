"use client";

import { useEffect } from "react";
import { APP_COMMIT, APP_VERSION } from "@/lib/app-version";

/**
 * Registers the PWA service worker in production and forces an auto-reload when a new
 * build is deployed (the SW is served by a Next route so it carries the build id; any
 * change in the bundled BUILD_ID triggers an install → activate cycle).
 */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    function forceReload(): void {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", forceReload);
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "NEW_VERSION") forceReload();
    });

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        // Proactively check for a new SW so hot-fixes propagate without waiting 24h.
        reg.update().catch(() => {});

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // A new version is ready and the existing SW still controls the page —
              // tell the new SW to take over; controllerchange then triggers the reload.
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {
        /* non-fatal */
      });

    const clientBuildId = `${APP_VERSION}+${APP_COMMIT}`;
    function checkServerBuild(): void {
      if (document.visibilityState !== "visible") return;
      fetch("/api/health", { cache: "no-store" })
        .then((r) => r.json())
        .then((data: { version?: string }) => {
          if (data.version && data.version !== clientBuildId) {
            forceReload();
          }
        })
        .catch(() => {});
    }
    document.addEventListener("visibilitychange", checkServerBuild);
    return () => {
      document.removeEventListener("visibilitychange", checkServerBuild);
    };
  }, []);
  return null;
}
