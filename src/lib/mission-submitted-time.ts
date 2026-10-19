/**
 * Client-safe helpers for showing *when* a mission was submitted and for
 * flagging likely repeat submissions on pending-mission cards.
 *
 * 2026-10-19: approvers saw four near-identical pending cards each showing only
 * "Submitted Oct 19" and could not tell which was current. Cards now show
 * date + HH:MM in CAT, pending lists sort newest-first, and similar pending
 * requests from the same requester get a "possible duplicate" hint.
 *
 * Pure functions only (no DB / server imports) so the page bundle stays small.
 */
import { missionDateRangesOverlap, normalizeMissionDestination } from "./mission-duplicates";

/** Fleet Hub operates in Lesotho/Zambia (both UTC+2); times are shown in CAT. */
export const MISSION_DISPLAY_TIME_ZONE = "Africa/Lusaka";
export const MISSION_DISPLAY_TZ_LABEL = "CAT";

/**
 * Parse a stored timestamp. Rows are written either as ISO with `Z`
 * (`2026-10-19T11:21:39.551Z`) or by SQLite `datetime('now')`
 * (`2026-10-19 11:21:39`, UTC with no zone). Zone-less values are treated as UTC
 * (browsers would otherwise read them as device-local, and Safari rejects them).
 */
export function parseMissionTimestamp(raw: string | null | undefined): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let iso = s;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(s);
  if (m) iso = `${m[1]}T${m[2]}Z`;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = `${s}T00:00:00Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function partsInZone(d: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: MISSION_DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** "19 Oct 2026, 13:21 CAT" — or "" when the timestamp is missing/invalid. */
export function formatMissionSubmittedAt(raw: string | null | undefined): string {
  const d = parseMissionTimestamp(raw);
  if (!d) return "";
  const p = partsInZone(d);
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${MISSION_DISPLAY_TZ_LABEL}`;
}

/** Compact "19 Oct 13:21" for steppers / chips (no year, no zone label). */
export function formatMissionSubmittedShort(raw: string | null | undefined): string {
  const d = parseMissionTimestamp(raw);
  if (!d) return "";
  const p = partsInZone(d);
  return `${p.day} ${p.month} ${p.hour}:${p.minute}`;
}

function tsValue(raw: string | null | undefined): number {
  return parseMissionTimestamp(raw)?.getTime() ?? 0;
}

/** Newest submission first (created_at desc, id as stable tiebreak). Returns a new array. */
export function sortMissionsNewestFirst<T extends { id: string; created_at?: string | null }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const diff = tsValue(b.created_at) - tsValue(a.created_at);
    if (diff !== 0) return diff;
    return String(a.id).localeCompare(String(b.id));
  });
}

export type DuplicateCandidate = {
  id: string;
  approval_status?: string | null;
  created_by_id?: string | null;
  created_by_name?: string | null;
  departure_location?: string | null;
  destination?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
};

function requesterKey(m: DuplicateCandidate): string {
  const id = String(m.created_by_id || "").trim();
  if (id) return `id:${id}`;
  const name = String(m.created_by_name || "").trim().toLowerCase();
  return name ? `name:${name}` : "";
}

function originKey(m: DuplicateCandidate): string {
  // Matches the UI's missionOriginLabel(): blank origin means HQ.
  return normalizeMissionDestination(String(m.departure_location || "").trim() || "HQ");
}

/**
 * For each *pending* mission, how many *other* pending missions share the same
 * requester, origin and destination with overlapping dates. Missions with no
 * matches are omitted from the map.
 */
export function countSimilarPendingMissions(rows: readonly DuplicateCandidate[]): Map<string, number> {
  const pending = rows.filter((m) => String(m.approval_status || "pending").toLowerCase() === "pending");
  const out = new Map<string, number>();
  for (const a of pending) {
    const who = requesterKey(a);
    const dest = normalizeMissionDestination(String(a.destination || ""));
    if (!who || !dest) continue;
    const from = originKey(a);
    let n = 0;
    for (const b of pending) {
      if (b.id === a.id) continue;
      if (requesterKey(b) !== who) continue;
      if (normalizeMissionDestination(String(b.destination || "")) !== dest) continue;
      if (originKey(b) !== from) continue;
      if (
        !missionDateRangesOverlap(
          String(a.departure_date || ""),
          String(a.return_date || ""),
          String(b.departure_date || ""),
          String(b.return_date || "")
        )
      )
        continue;
      n++;
    }
    if (n > 0) out.set(a.id, n);
  }
  return out;
}

export function possibleDuplicateHint(n: number): string {
  if (!n || n < 1) return "";
  return `Possible duplicate of ${n} other pending request${n === 1 ? "" : "s"}`;
}
