import type { Database } from "better-sqlite3";
import {
  countryFromOrganization,
  hasHrFmApprovalRole,
} from "@/lib/hr-approval-roles";
import { holdsFleetLeadForOrg, isFleetLeadForOrg } from "@/lib/fleet-lead-scope";

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
 * fleet lead is the canonical grantee for that role (set in HR by the
 * backfill command), so fleet lead of THIS organization (own-org fleet_lead
 * role or a fleet-lead scope row) still passes during the transition.
 * Manager/admin/superadmin remain break-glass approvers.
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
  // Legacy role-based shortcut — fleet lead is the canonical grantee for
  // mechanical-override approver in HR, so honoring it here (own organization
  // only) is equivalent until Phase 6 removes the fallback.
  if (role === "manager" || role === "admin") return true;
  if (holdsFleetLeadForOrg(db, organizationId, userEmail, userRole)) return true;

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
 *   - users whose role is literally `fleet_lead` are EXPLICITLY EXCLUDED —
 *     fleet lead approves mechanical overrides and vehicle allocation, NOT
 *     missions or trips. The exclusion is on the role string only: a manager
 *     who also holds a fleet-lead scope (user_fleet_lead_scopes) keeps the
 *     manager's approval rights.
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
  // Drop the literal fleet_lead role from mission approval entirely.
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

/**
 * Allocate / reserve a fleet vehicle for a mission or vehicle request.
 *
 * Fleet lead is a per-organization capability ({@link isFleetLeadForOrg}):
 * superadmin (global), a fleet-lead scope row, a legacy `fleet_lead` role in the
 * user's own organization, or the HR-canonical `fm:vehicle_allocator` grant for
 * the organization's country. Manager/admin alone do NOT allocate.
 */
export async function canAllocateFleetVehicleForOrg(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): Promise<boolean> {
  return isFleetLeadForOrg(db, organizationId, userEmail, userRole);
}

/**
 * Outside-50-km mechanical-inspection override when reserving a vehicle:
 * fleet lead for the org (as above) OR a mission approver for the org
 * (manager/admin role, or HR fm:mission_approver for that country).
 * Superadmin is global. A literal `fleet_lead` role gets it only through the
 * fleet-lead side, i.e. in its own organization.
 */
export async function canSkipLocalityInspectionForOrg(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): Promise<boolean> {
  if (await isFleetLeadForOrg(db, organizationId, userEmail, userRole)) return true;
  return canApproveMissionRequests(db, organizationId, userEmail, userRole);
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

/**
 * Break an overlapping vehicle reservation (double-book) with audit reason.
 * Role-only: a fleet-lead scope does not confer it and the literal `fleet_lead`
 * role cannot, so a manager who is also fleet lead keeps it via the manager role.
 */
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
