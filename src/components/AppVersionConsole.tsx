"use client";

import { useEffect } from "react";
import { appVersionLabel } from "@/lib/app-version";

/**
 * Logs semver once per full page load so production debugging can confirm build age.
 */
export function AppVersionConsole(): null {
  useEffect(() => {
    const label = appVersionLabel();
    console.info(`[1PWR Fleet Hub] ${label} · loaded`);
  }, []);
  return null;
}
