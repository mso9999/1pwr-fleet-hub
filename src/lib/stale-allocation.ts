/** Calendar-day rules for approved missions whose vehicle request never gets a vehicle. Pure — no database. */
import { calendarDaysBetween } from "@/lib/stale-approval";

export const ALLOCATION_WARN_AFTER_DAYS = 7;
export const ALLOCATION_CANCEL_AFTER_DAYS = 14;

export type StaleAllocationAction = "warn" | "cancel" | "none";

/**
 * Warn once the request has waited 7 days for a vehicle. Cancel at 14 days, but
 * only after a warning for this same waiting period was already sent — a request
 * already past 14 days on the first run is warned, not silently cancelled.
 * A warning from before this stay (an earlier approval) does not count.
 */
export function decideStaleAllocation(args: {
  now: Date;
  pendingSince: Date | null;
  warningSentAt: Date | null;
}): StaleAllocationAction {
  if (!args.pendingSince) return "none";
  const pendingDays = calendarDaysBetween(args.pendingSince, args.now);
  if (pendingDays < ALLOCATION_WARN_AFTER_DAYS) return "none";

  const warningIsForThisStay =
    args.warningSentAt != null && args.warningSentAt.getTime() >= args.pendingSince.getTime();
  if (!warningIsForThisStay) return "warn";
  if (pendingDays >= ALLOCATION_CANCEL_AFTER_DAYS) return "cancel";
  return "none";
}
