import type { Database } from "better-sqlite3";
import {
  countryFromOrganization,
  hasHrFmApprovalRole,
} from "@/lib/hr-approval-roles";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Legacy HR / PR country-filtered approvers saved in Admin (FM's
 * vehicle_check_override_approvers table). Retained as a transition fallback
 * for the 30-day window between Phase 2 (HR-canonical go-live) and Phase 6
 * (legacy table deprecation). New grants should be made via the HR portal.
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

/**
 * Approve vehicle-check (mechanical-inspection) exceptions.
 *
 * Per the cross-toolset approval consolidation (2026-07-03), this is now
 * gated by the HR-canonical `fm:mechanical_override_approver` role. The
 * fleet_lead role is the canonical grantee for that role (set in HR by the
 * backfill command), so legacy role-only checks for fleet_lead continue to
 * work during the transition. Manager/admin/superadmin remain break-glass
 * approvers.
 *
 * HR-canonical path is tried first; if HR is unreachable AND we have no
 * cached row for the user, we fall back to the legacy table.
 */
export async function canApproveVehicleCheckExceptions(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): Promise<boolean> {
  const role = (userRole || "").toLowerCase();
  if (role === "superadmin") return true;
  // Legacy role-based shortcut — fleet_lead is the canonical grantee for
  // mechanical-override approver in HR, so honoring the role here is
  // equivalent until Phase 6 removes the role fallback.
  if (role === "fleet_lead" || role === "manager" || role === "admin") return true;

  const country = countryFromOrganization(db, organizationId);
  const hrApproved = await hasHrFmApprovalRole(
    userEmail,
    "mechanical_override_approver",
    country,
  );
  if (hrApproved) return true;

  // Legacy fallback.
  return isPrCountryMissionApprover(db, organizationId, userEmail);
}

/**
 * Mission (vehicle) request approve/reject.
 *
 * Per the cross-toolset approval consolidation (2026-07-03):
 *   - HR-canonical `fm:mission_approver` is the primary grant.
 *   - `fleet_lead` is EXPLICITLY EXCLUDED — fleet lead approves mechanical
 *     overrides and vehicle allocation, NOT missions or trips.
 *   - Manager/admin/superadmin remain break-glass approvers during the
 *     transition. Phase 6 will remove the role fallback.
 *   - Legacy vehicle_check_override_approvers table is the last-resort
 *     fallback when HR is unreachable.
 */
export async function canApproveMissionRequests(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): Promise<boolean> {
  const role = (userRole || "").toLowerCase();
  if (role === "superadmin") return true;
  // Drop fleet_lead from mission approval entirely.
  if (role === "fleet_lead") return false;
  // Backwards-compat role fallback (manager/admin). To be removed in Phase 6
  // once HR-canonical grants are verified via the backfill command.
  if (role === "manager" || role === "admin") return true;

  const country = countryFromOrganization(db, organizationId);
  const hrApproved = await hasHrFmApprovalRole(
    userEmail,
    "mission_approver",
    country,
  );
  if (hrApproved) return true;

  // Legacy fallback.
  return isPrCountryMissionApprover(db, organizationId, userEmail);
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
 * Allocate a vehicle to a vehicle request (pool assignment).
 *
 * Per the consolidation: HR-canonical `fm:vehicle_allocator` is the
 * canonical grant, with fleet_lead as its primary grantee (set in HR by
 * the backfill command). Since fleet_lead is the canonical grantee and
 * the HR role check is equivalent to the local role check, we keep this
 * sync and role-based for now — Phase 6 will switch this to the HR
 * canonical path once the legacy fallback is removed.
 */
export function canAllocateFleetVehicle(userRole: string): boolean {
  return userRole === "fleet_lead" || userRole === "superadmin";
}

/**
 * Capacity / defer / cancel arbitration when too many approved missions
 * compete for vehicles.
 *
 * Per the consolidation: HR-canonical `fm:capacity_arbitrator` is the
 * primary grant. Fleet lead is excluded (consistent with mission approval
 * exclusion — fleet lead doesn't arbitrate business capacity, only vehicle
 * mechanical / allocation). Manager/admin/superadmin remain break-glass.
 * Legacy table fallback retained during transition.
 */
export async function canArbitrateMissionCapacity(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): Promise<boolean> {
  const role = (userRole || "").toLowerCase();
  if (role === "fleet_lead") return false;
  if (role === "superadmin") return true;
  if (role === "manager" || role === "admin") return true;

  const country = countryFromOrganization(db, organizationId);
  const hrApproved = await hasHrFmApprovalRole(
    userEmail,
    "capacity_arbitrator",
    country,
  );
  if (hrApproved) return true;

  return isPrCountryMissionApprover(db, organizationId, userEmail);
}

/** Break an overlapping vehicle reservation (double-book) with audit reason. */
export function canOverrideReservationOverlap(userRole: string): boolean {
  return userRole === "manager" || userRole === "admin" || userRole === "superadmin";
}

/**
 * Manager / approver override for a missing trip / checklist / inspection /
 * approved mission gate.
 *
 * Per the consolidation: gated by HR-canonical `fm:mission_approver` (same
 * cohort as mission approval). Fleet lead excluded. Manager/admin/superadmin
 * remain break-glass. Legacy table fallback retained during transition.
 */
export async function canOverridePrerequisite(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string,
): Promise<boolean> {
  return canApproveMissionRequests(db, organizationId, userEmail, userRole);
}
