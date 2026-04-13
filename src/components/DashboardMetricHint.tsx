"use client";

import { useState } from "react";
import { useLocaleContext } from "@/i18n/locale-context";
type Align = "left" | "center";

/**
 * Label + small (i) control; click toggles a plain-language description (dashboard abbreviations / metrics).
 */
export function DashboardMetricHint({
  hintKey,
  align = "left",
  children,
}: {
  hintKey: string;
  align?: Align;
  children: React.ReactNode;
}): React.ReactElement {
  const { t } = useLocaleContext();
  const [open, setOpen] = useState(false);
  const description = t(`dashboard.hints.${hintKey}`);
  const hasHint = !description.startsWith("dashboard.hints.");

  const btn = hasHint && (
    <button
      type="button"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-[9px] font-serif font-bold leading-none text-zinc-500 shadow-sm hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 mt-0.5"
      aria-expanded={open}
      aria-label={open ? "Hide explanation" : "Explain this metric"}
      onClick={() => setOpen((o) => !o)}
    >
      i
    </button>
  );

  return (
    <div className="w-full min-w-0">
      {align === "center" ? (
        <div className="flex justify-center">
          <span className="inline-flex max-w-full items-start gap-1">
            {children}
            {btn}
          </span>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">{children}</div>
          {btn}
        </div>
      )}
      {hasHint && open && (
        <p className="mt-1.5 text-left text-[11px] leading-snug text-zinc-600 font-normal normal-case tracking-normal">
          {description}
        </p>
      )}
    </div>
  );
}
