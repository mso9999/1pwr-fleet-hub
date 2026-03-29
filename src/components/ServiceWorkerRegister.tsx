"use client";

import { useEffect } from "react";

/**
 * Registers the minimal PWA service worker in production only.
 */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* non-fatal */
    });
  }, []);
  return null;
}
