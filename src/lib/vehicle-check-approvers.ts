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
 * backfill command), so the fleet lead of THIS organization (own-org
 * fleet_lead role or a fleet-lead scope row) still passes during the
 * transition. Manager/admin/superadmin remain break-glass approvers.
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
  if (role === "manager" || role === "admin") return true;
  // Legacy shortcut — fleet lead is the canonical grantee for mechanical-override
  // approver in HR, so honoring it here (this organization only) is equivalent
  // until Phase 6 removes the fallback.
  if (holdsFleetLeadForOrg(db, organizationId, { email: userEmail, role: userRole })) return true;

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
 * Per the cross-toolset approval consolidation (2026-07-03), now country-scoped:
 * the caller must be fleet lead for the organization ({@link isFleetLeadForOrg}):
 *   - superadmin (global);
 *   - a fleet-lead scope row for the org (user_fleet_lead_scopes);
 *   - legacy `fleet_lead` role whose home organization is this org (a
 *     fleet_lead no longer allocates in other countries);
 *   - the HR-canonical `fm:vehicle_allocator` grant for the org's country.
 * No legacy-table fallback: allocation was never granted through
 * vehicle_check_override_approvers. Manager/admin alone do NOT allocate.
 * The former role-only `canAllocateFleetVehicle(role)` was removed: it let a
 * fleet_lead allocate in every country.
 */
export async function canAllocateFleetVehicleForOrg(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): Promise<boolean> {
  return isFleetLeadForOrg(db, organizationId, { email: userEmail, role: userRole });
}

/** Minimal caller shape for org-scoped mission allocation / override checks. */
export type FleetCaller = { email: string; role: string; organizationId?: string | null };

/**
 * Reserve a vehicle on a MISSION (reserve-candidates / reserve-vehicle).
 *
 * Everyone who is fleet lead for the org (as {@link canAllocateFleetVehicleForOrg}),
 * plus a `manager` whose home organization is the mission's org. Managers need
 * this so they can use the outside-50-km inspection override (hotfix 2026-10-09).
 */
export async function canReserveMissionVehicleForOrg(
  db: Database,
  organizationId: string,
  user: FleetCaller
): Promise<boolean> {
  if (await isFleetLeadForOrg(db, organizationId, user)) return true;
  const role = (user.role || "").toLowerCase();
  return role === "manager" && !!organizationId && user.organizationId === organizationId;
}

/**
 * Who may skip the outside-50-km mechanical-inspection gate on reserve-vehicle
 * (with an 8+ character reason, enforced by the route):
 *   - fleet lead for the org ({@link isFleetLeadForOrg}): superadmin (global),
 *     a fleet-lead scope row for the org, a `fleet_lead` whose home organization
 *     is the org, or HR-canonical `fm:vehicle_allocator` for its country
 *   - manager whose home organization is the mission's org
 * A manager who also holds the org's fleet-lead scope passes either way.
 */
export async function canOverrideInspectionGate(
  db: Database,
  organizationId: string,
  user: FleetCaller
): Promise<boolean> {
  if (await isFleetLeadForOrg(db, organizationId, user)) return true;
  const role = (user.role || "").toLowerCase();
  return role === "manager" && !!organizationId && user.organizationId === organizationId;
}

/**
 * Who may set an unapproved / not-yet-registered driver on a vehicle request
 * (EHS approved-driver gate), with an 8+ character reason (enforced by the route).
 * Same cohort as {@link canOverrideInspectionGate}: manager / fleet_lead of the
 * org, HR fm:vehicle_allocator for its country, superadmin anywhere. Hotfix
 * 2026-10-09 for orgs with no approved drivers yet (ZM).
 */
export async function canOverrideDriverApproval(
  db: Database,
  organizationId: string,
  user: FleetCaller
): Promise<boolean> {
  return canOverrideInspectionGate(db, organizationId, user);
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
 * Role-only and unchanged by fleet-lead scopes: a manager who is also a fleet
 * lead keeps it via the manager role; the literal `fleet_lead` role never has it.
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
