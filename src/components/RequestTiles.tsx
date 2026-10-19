"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type RequestTileTone = "amber" | "sky" | "emerald" | "violet" | "zinc" | "red";

const TONE: Record<RequestTileTone, { tile: string; count: string }> = {
  amber: { tile: "border-amber-200 bg-amber-50/60 hover:bg-amber-50", count: "text-amber-900" },
  sky: { tile: "border-sky-200 bg-sky-50/60 hover:bg-sky-50", count: "text-sky-900" },
  emerald: { tile: "border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50", count: "text-emerald-900" },
  violet: { tile: "border-violet-200 bg-violet-50/60 hover:bg-violet-50", count: "text-violet-900" },
  zinc: { tile: "border-zinc-200 bg-white hover:bg-zinc-50", count: "text-zinc-900" },
  red: { tile: "border-red-200 bg-red-50/40 hover:bg-red-50", count: "text-red-900" },
};

/** One summary tile in the /vehicle-requests grid. Clicking opens its modal. */
export function RequestTile({
  tileKey,
  label,
  hint,
  count,
  pendingCount = 0,
  pendingLabel = "pending",
  tone = "zinc",
  onOpen,
  dataTutorial,
}: {
  tileKey: string;
  label: string;
  hint?: string;
  count: number;
  pendingCount?: number;
  pendingLabel?: string;
  tone?: RequestTileTone;
  onOpen: () => void;
  dataTutorial?: string;
}): React.ReactElement {
  const t = TONE[tone];
  const empty = count === 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`request-tile-${tileKey}`}
      data-tutorial={dataTutorial}
      aria-haspopup="dialog"
      aria-label={`${label}: ${count}${pendingCount > 0 ? `, ${pendingCount} ${pendingLabel}` : ""}`}
      className={cn(
        "relative flex min-h-[88px] w-full flex-col justify-between rounded-xl border p-3 text-left shadow-sm transition-colors touch-manipulation",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900",
        t.tile,
        empty && "opacity-60"
      )}
    >
      <span className="pr-10 text-[13px] font-medium leading-tight text-zinc-700 sm:text-sm">{label}</span>
      <span className="mt-2 flex items-end justify-between gap-2">
        <span className={cn("text-2xl font-semibold tabular-nums leading-none sm:text-3xl", t.count)}>{count}</span>
        {hint && <span className="hidden text-[11px] leading-tight text-zinc-500 sm:block sm:text-right">{hint}</span>}
      </span>
      {pendingCount > 0 && (
        <span
          className="absolute right-2 top-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
          data-testid={`request-tile-badge-${tileKey}`}
          title={`${pendingCount} ${pendingLabel}`}
        >
          {pendingCount}
        </span>
      )}
    </button>
  );
}

/**
 * Modal that lists one tile's requests. Full-screen sheet on phones, centred
 * dialog from `sm` up. Locks body scroll; Escape closes unless a nested dialog
 * (e.g. request details) is open.
 */
export function RequestsGroupModal({
  tileKey,
  title,
  subtitle,
  onClose,
  closeOnEscape = true,
  children,
}: {
  tileKey: string;
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  closeOnEscape?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const escRef = useRef(closeOnEscape);
  useEffect(() => {
    escRef.current = closeOnEscape;
  }, [closeOnEscape]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape" && escRef.current) onClose();
    }
    // Capture phase: card action rows stop keydown propagation (PendingMissionApprovalActions).
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const titleId = `request-group-title-${tileKey}`;
  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/40 sm:items-start sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={`request-group-modal-${tileKey}`}
    >
      <div className="absolute inset-0" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 flex h-full w-full flex-col bg-zinc-50 shadow-xl outline-none sm:h-auto sm:max-h-[calc(100vh-3rem)] sm:max-w-3xl sm:rounded-xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:rounded-t-xl">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-zinc-900">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-xs text-zinc-600">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-zinc-500 hover:bg-zinc-100 touch-manipulation"
            aria-label="Close"
            data-testid="request-group-modal-close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">{children}</div>
      </div>
    </div>
  );
}
