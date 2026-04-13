"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Locale, MessageTree } from "@/i18n/messages";
import { messages } from "@/i18n/messages";

const STORAGE_KEY = "fleet-hub-locale";

function getByPath(tree: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let node: unknown = tree;
  for (const p of parts) {
    if (node === null || node === undefined || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[p];
  }
  return typeof node === "string" ? node : undefined;
}

type TFunction = (path: string) => string;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
  tree: MessageTree;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "fr" || raw === "en") return raw;
  } catch {
    /* ignore */
  }
  return "en";
}

export function LocaleProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocaleState(readStoredLocale());
    setMounted(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const tree = messages[locale];

  const t = useCallback<TFunction>(
    (path) => {
      const v = getByPath(tree, path);
      if (v !== undefined) return v;
      const fallback = getByPath(messages.en, path);
      return fallback ?? path;
    },
    [tree]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, tree }),
    [locale, setLocale, t, tree]
  );

  if (!mounted) {
    return (
      <LocaleContext.Provider value={{ locale: "en", setLocale, t: (p) => getByPath(messages.en, p) ?? p, tree: messages.en }}>
        {children}
      </LocaleContext.Provider>
    );
  }

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocaleContext must be used within LocaleProvider");
  }
  return ctx;
}

/** Safe hook when provider might not wrap (e.g. tests); falls back to English. */
export function useT(): TFunction {
  const ctx = useContext(LocaleContext);
  const tree = ctx?.tree ?? messages.en;
  return useCallback(
    (path: string) => {
      const v = getByPath(tree, path);
      if (v !== undefined) return v;
      return getByPath(messages.en, path) ?? path;
    },
    [tree]
  );
}
