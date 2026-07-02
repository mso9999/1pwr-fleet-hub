import type { Database } from "better-sqlite3";
import { canApproveMissionRequests } from "@/lib/vehicle-check-approvers";

/** Normalise to YYYY-MM-DD or empty. */
export function normalizeCalendarDay(value: string | unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.slice(0, 10);
}

/** Last calendar day of the mission window (return date if set, else departure). */
export function missionWindowEndDate(departure: string, returnDate: string | unknown): string {
  const dep = normalizeCalendarDay(departure);
  if (!dep) return "";
  const ret = normalizeCalendarDay(returnDate);
  return ret || dep;
}

/** Lexicographic compare for ISO calendar days: -1 | 0 | 1 */
export function compareCalendarDays(a: string, b: string): number {
  return normalizeCalendarDay(a).localeCompare(normalizeCalendarDay(b));
}

/**
 * True when the mission/assignment window ends strictly after the disc expiry
 * (vehicle would be used past registration validity).
 */
export function registrationDiscMissionBlocked(missionEndDay: string, discExpiryRaw: unknown): boolean {
  const disc = normalizeCalendarDay(discExpiryRaw);
  if (!disc) return false;
  const end = normalizeCalendarDay(missionEndDay);
  if (!end) return false;
  return compareCalendarDays(end, disc) > 0;
}

/** PR-credentialed approvers / fleet management + 8+ char reason (same cohort as mission approval). */
export async function registrationDiscOverrideAllowed(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string,
  overrideReason: string
): Promise<boolean> {
  const r = overrideReason.trim();
  if (r.length < 8) return false;
  return canApproveMissionRequests(db, organizationId, userEmail, userRole);
}

/** Whole UTC days from todayYmd to expiryYmd (negative = already expired). */
export function calendarDaysUntil(todayYmd: string, expiryYmd: string): number | null {
  const a = normalizeCalendarDay(todayYmd);
  const b = normalizeCalendarDay(expiryYmd);
  if (!a || !b) return null;
  const t0 = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  const t1 = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
  return Math.round((t1 - t0) / 86400000);
}

export type RegistrationDiscDashboardTier = "expired" | "within_30" | "within_60";

/** Which alert tier applies (null = no alert for this vehicle on this day). */
export function registrationDiscDashboardTier(
  todayYmd: string,
  expiryYmd: string
): RegistrationDiscDashboardTier | null {
  const days = calendarDaysUntil(todayYmd, expiryYmd);
  if (days === null) return null;
  if (days < 0) return "expired";
  if (days <= 30) return "within_30";
  if (days <= 60) return "within_60";
  return null;
}
