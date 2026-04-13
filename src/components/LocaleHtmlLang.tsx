"use client";

import { useEffect } from "react";
import { useLocaleContext } from "@/i18n/locale-context";

/** Syncs <html lang> with the active locale (root layout stays server-rendered). */
export function LocaleHtmlLang(): null {
  const { locale } = useLocaleContext();

  useEffect(() => {
    document.documentElement.lang = locale === "fr" ? "fr" : "en";
  }, [locale]);

  return null;
}
