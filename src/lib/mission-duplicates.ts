import type Database from "better-sqlite3";

export const ACTIVE_MISSION_APPROVAL_FOR_DEDUPE = ["pending", "approved"] as const;

export function normalizeMissionDestination(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Inclusive date overlap on YYYY-MM-DD (empty return treated as same as departure). */
export function missionDateRangesOverlap(
  aDep: string,
  aRet: string,
  bDep: string,
  bRet: string
): boolean {
  const aStart = String(aDep || "").slice(0, 10);
  const aEnd = String(aRet || aDep || "").slice(0, 10);
  const bStart = String(bDep || "").slice(0, 10);
  const bEnd = String(bRet || bDep || "").slice(0, 10);
  if (!aStart || !bStart) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

export type SimilarMissionRow = {
  id: string;
  title: string;
  destination: string;
  departure_date: string;
  return_date: string;
  approval_status: string;
  created_at: string;
};

/**
 * Same requester, same destination (normalized), overlapping dates, still active
 * (pending or approved, lifecycle active, planned).
 */
export function findSimilarActiveMissions(
  db: Database.Database,
  args: {
    organizationId: string;
    createdById: string;
    destination: string;
    departureDate: string;
    returnDate: string;
    excludeMissionId?: string | null;
  }
): SimilarMissionRow[] {
  const destNorm = normalizeMissionDestination(args.destination);
  if (!destNorm || !args.createdById.trim()) return [];

  const rows = db
    .prepare(
      `SELECT id, title, destination, departure_date, return_date, approval_status, created_at
       FROM missions
       WHERE organization_id = ?
         AND created_by_id = ?
         AND lower(COALESCE(status, 'planned')) = 'planned'
         AND lower(COALESCE(lifecycle_status, 'active')) = 'active'
         AND lower(COALESCE(approval_status, '')) IN ('pending', 'approved')
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .all(args.organizationId, args.createdById) as SimilarMissionRow[];

  return rows.filter((r) => {
    if (args.excludeMissionId && r.id === args.excludeMissionId) return false;
    if (normalizeMissionDestination(r.destination) !== destNorm) return false;
    return missionDateRangesOverlap(
      args.departureDate,
      args.returnDate,
      r.departure_date,
      r.return_date
    );
  });
}
