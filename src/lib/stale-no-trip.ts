/**
 * Calendar-day rules for approved missions that never get a planned trip.
 * Pure — no database.
 */
import { calendarDaysBetween } from "@/lib/stale-approval";

export const NO_TRIP_EXPIRE_AFTER_DAYS = 14;
/** Days after approval at which warning stage 1, 2, 3 is sent (7, 3 and 1 day left). */
export const NO_TRIP_WARN_DAYS = [7, 11, 13] as const;

export type NoTripAction =
  | { kind: "none" }
  | { kind: "warn"; stage: number; daysLeft: number }
  | { kind: "expire" };

/**
 * `since` is when the no-trip clock started (approval, or a later reactivation).
 * `warnedStage` / `warnedAt` are ignored when they predate `since`.
 * A mission is never expired on the run that first warns it: past 14 days
 * without a warning it gets a final notice and expires on a later daily run.
 */
export function decideNoTrip(args: {
  now: Date;
  since: Date | null;
  warnedStage: number;
  warnedAt: Date | null;
}): NoTripAction {
  if (!args.since) return { kind: "none" };
  const days = calendarDaysBetween(args.since, args.now);
  const warningCounts = args.warnedAt != null && args.warnedAt.getTime() >= args.since.getTime();
  const stage = warningCounts ? args.warnedStage : 0;

  if (days >= NO_TRIP_EXPIRE_AFTER_DAYS) {
    if (stage >= 1 && args.warnedAt && calendarDaysBetween(args.warnedAt, args.now) >= 1) {
      return { kind: "expire" };
    }
    if (stage >= NO_TRIP_WARN_DAYS.length) return { kind: "none" };
    return { kind: "warn", stage: NO_TRIP_WARN_DAYS.length, daysLeft: 0 };
  }

  let due = 0;
  NO_TRIP_WARN_DAYS.forEach((d, i) => {
    if (days >= d) due = i + 1;
  });
  if (due > stage) {
    return { kind: "warn", stage: due, daysLeft: NO_TRIP_EXPIRE_AFTER_DAYS - days };
  }
  return { kind: "none" };
}
