import type Database from "better-sqlite3";

export interface CapacityShortfall {
  id: string;
  organization_id: string;
  departure_date: string;
  status: string;
  reason: string;
  flagged_by_id: string;
  flagged_by_name: string;
  flagged_at: string;
  cleared_by_id: string;
  cleared_by_name: string;
  cleared_at: string;
}

/** YYYY-MM-DD from a mission departure value, or "" when it is not a date. */
export function departureDateKey(value: unknown): string {
  const match = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function listOpenShortfalls(db: Database.Database, organizationId: string): CapacityShortfall[] {
  return db
    .prepare(
      `SELECT * FROM departure_capacity_shortfalls
       WHERE organization_id = ? AND status = 'open'
       ORDER BY departure_date`
    )
    .all(organizationId) as CapacityShortfall[];
}

export function openShortfall(
  db: Database.Database,
  organizationId: string,
  departureDate: string
): CapacityShortfall | undefined {
  const date = departureDateKey(departureDate);
  if (!date) return undefined;
  return db
    .prepare(
      `SELECT * FROM departure_capacity_shortfalls
       WHERE organization_id = ? AND departure_date = ? AND status = 'open'`
    )
    .get(organizationId, date) as CapacityShortfall | undefined;
}
