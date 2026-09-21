/** Calendar-day rules for unapproved Fleet Hub requests. Pure — no database. */

export const WARN_AFTER_DAYS = 20;
export const REJECT_AFTER_DAYS = 30;

export type StaleApprovalAction = "warn" | "reject" | "none";

export function parseDbTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}

export function calendarDaysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((end - start) / 86_400_000);
}

export function addCalendarDays(from: Date, days: number): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days));
}

/**
 * Warn once the request has been waiting 20 days. Reject at 30 days, but only
 * after a warning for this same waiting period was already sent — a request
 * that is already past 30 days on the first run is warned, not silently rejected.
 * A warning from an earlier submission does not count after a resubmit.
 */
export function decideStaleApproval(args: {
  now: Date;
  pendingSince: Date | null;
  warningSentAt: Date | null;
}): StaleApprovalAction {
  if (!args.pendingSince) return "none";
  const pendingDays = calendarDaysBetween(args.pendingSince, args.now);
  if (pendingDays < WARN_AFTER_DAYS) return "none";

  const warningIsForThisStay =
    args.warningSentAt != null && args.warningSentAt.getTime() >= args.pendingSince.getTime();
  if (!warningIsForThisStay) return "warn";
  if (pendingDays >= REJECT_AFTER_DAYS) return "reject";
  return "none";
}
