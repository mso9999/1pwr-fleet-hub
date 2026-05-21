import type Database from "better-sqlite3";

/**
 * Vehicles available for assignment to trips/requests (same rule as vehicle request assign API).
 * Personal-vehicle reimbursement is only allowed when this count is zero — otherwise a fleet vehicle should be used.
 * Claims must also reference an approved, active mission (`pvr-mission.ts` validates on submit).
 * If the pool snapshot at submit shows operational vehicles, `pvr-approval-rules.ts` requires override text in Notes to approve.
 */
export function countOperationalVehiclesInPool(db: Database.Database, organizationId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM vehicles WHERE organization_id = ? AND status = 'operational'`
    )
    .get(organizationId) as { c: number } | undefined;
  return row?.c ?? 0;
}
