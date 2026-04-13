import type { Database } from "better-sqlite3";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function canApproveVehicleCheckExceptions(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): boolean {
  if (
    userRole === "fleet_lead" ||
    userRole === "manager" ||
    userRole === "admin"
  ) {
    return true;
  }
  const n = normalizeEmail(userEmail);
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM vehicle_check_override_approvers
       WHERE organization_id = ? AND lower(trim(email)) = ?`
    )
    .get(organizationId, n) as { ok: number } | undefined;
  return !!row;
}
