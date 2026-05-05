import type { Database } from "better-sqlite3";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * HR / PR country-filtered approvers saved in Admin (same rows as vehicle check exception approvers).
 */
export function isPrCountryMissionApprover(
  db: Database,
  organizationId: string,
  userEmail: string
): boolean {
  const n = normalizeEmail(userEmail);
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM vehicle_check_override_approvers
       WHERE organization_id = ? AND lower(trim(email)) = ?`
    )
    .get(organizationId, n) as { ok: number } | undefined;
  return !!row;
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
    userRole === "admin" ||
    userRole === "superadmin"
  ) {
    return true;
  }
  return isPrCountryMissionApprover(db, organizationId, userEmail);
}

/**
 * Mission (vehicle) request approve/reject — fleet roles or PR country-aware approver list for the org.
 */
export function canApproveMissionRequests(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): boolean {
  return canApproveVehicleCheckExceptions(db, organizationId, userEmail, userRole);
}

/** Full edit / assign vehicle — fleet management (not PR list-only approvers). */
export function canFullyManageVehicleRequests(userRole: string): boolean {
  return (
    userRole === "fleet_lead" ||
    userRole === "manager" ||
    userRole === "admin" ||
    userRole === "superadmin"
  );
}

/**
 * Allocate a vehicle to a vehicle request (pool assignment). Fleet team lead only (+ superadmin override).
 */
export function canAllocateFleetVehicle(userRole: string): boolean {
  return userRole === "fleet_lead" || userRole === "superadmin";
}

/**
 * Capacity / defer / cancel arbitration when too many approved missions compete for vehicles.
 * Fleet lead is excluded; managers, admins, superadmins, and PR-credentialed approvers may act.
 */
export function canArbitrateMissionCapacity(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): boolean {
  if (userRole === "fleet_lead") return false;
  return canApproveMissionRequests(db, organizationId, userEmail, userRole);
}

/** Break an overlapping vehicle reservation (double-book) with audit reason. */
export function canOverrideReservationOverlap(userRole: string): boolean {
  return userRole === "manager" || userRole === "admin" || userRole === "superadmin";
}

/**
 * Manager / approver override for a missing trip / checklist / inspection / approved mission gate.
 *
 * Same set as mission approvers: admins, fleet management, and PR-credentialed approvers in the org.
 * Used by the override panel on trip checkout, vehicle request submit, and country change requests.
 */
export function canOverridePrerequisite(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string,
): boolean {
  return canApproveMissionRequests(db, organizationId, userEmail, userRole);
}
