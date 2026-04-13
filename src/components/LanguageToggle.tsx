"use client";

import { cn } from "@/lib/utils";
import { useLocaleContext } from "@/i18n/locale-context";
import type { Locale } from "@/i18n/messages";

const OPTIONS: { value: Locale; labelKey: "language.en" | "language.fr" }[] = [
  { value: "en", labelKey: "language.en" },
  { value: "fr", labelKey: "language.fr" },
];

export function LanguageToggle({ className }: { className?: string }): React.ReactElement {
  const { locale, setLocale, t } = useLocaleContext();

  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-semibold",
        className
      )}
      role="group"
      aria-label={t("language.label")}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setLocale(opt.value)}
          className={cn(
            "rounded-md px-2.5 py-1 transition-colors",
            locale === opt.value
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-800"
          )}
        >
          {t(opt.labelKey)}
        </button>
      ))}
    </div>
  );
}
