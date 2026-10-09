/**
 * Country-scoped fleet-lead capability.
 *
 * "Fleet lead" is a capability held per organization, separate from users.role, so one
 * person can be a manager (mission approver) AND the fleet lead for their own country.
 *
 * A user is fleet lead for org X when ANY of:
 *   - role is superadmin (global);
 *   - a user_fleet_lead_scopes row exists for (user, X);
 *   - legacy: role is literally 'fleet_lead' AND the user's home organization is X;
 *   - HR grants fm:vehicle_allocator for X's country (or globally) — async check only.
 *
 * {@link holdsFleetLeadForOrg} is the sync, DB-only part; {@link isFleetLeadForOrg} adds
 * the HR grant. HR fleet-role sync only writes users.role and never touches scope rows.
 */
import type { Database } from "better-sqlite3";
import { countryFromOrganization, hasHrFmApprovalRole } from "@/lib/hr-approval-roles";
import type { FleetCaller } from "@/lib/vehicle-check-approvers";

const DEFAULT_ORG = "1pwr_lesotho";

export interface FleetLeadScopeRow {
  user_id: string;
  organization_id: string;
  granted_by: string;
  granted_at: string;
  email: string;
  name: string;
  role: string;
}

/** Same email match and home-org default as server-auth's users lookup. */
export function findUserByEmail(
  db: Database,
  email: string
): { id: string; email: string; role: string; organization_id: string } | undefined {
  const n = (email || "").trim().toLowerCase();
  if (!n) return undefined;
  return db
    .prepare(
      `SELECT id, email, role, IFNULL(organization_id, '${DEFAULT_ORG}') AS organization_id
       FROM users WHERE lower(trim(email)) = ?`
    )
    .get(n) as { id: string; email: string; role: string; organization_id: string } | undefined;
}

export function hasFleetLeadScopeRow(db: Database, userId: string, organizationId: string): boolean {
  return !!db
    .prepare("SELECT 1 AS ok FROM user_fleet_lead_scopes WHERE user_id = ? AND organization_id = ?")
    .get(userId, organizationId);
}

export function listFleetLeadScopes(db: Database, organizationId?: string): FleetLeadScopeRow[] {
  return db
    .prepare(
      `SELECT s.user_id, s.organization_id, s.granted_by, s.granted_at, u.email, u.name, u.role
       FROM user_fleet_lead_scopes s JOIN users u ON u.id = s.user_id
       WHERE (? IS NULL OR s.organization_id = ?)
       ORDER BY s.organization_id, u.email`
    )
    .all(organizationId ?? null, organizationId ?? null) as FleetLeadScopeRow[];
}

/** Returns true when a new row was inserted (false if it already existed). */
export function grantFleetLeadScope(
  db: Database,
  userId: string,
  organizationId: string,
  grantedBy: string
): boolean {
  return (
    db
      .prepare(
        "INSERT OR IGNORE INTO user_fleet_lead_scopes (user_id, organization_id, granted_by) VALUES (?, ?, ?)"
      )
      .run(userId, organizationId, grantedBy).changes > 0
  );
}

/** Returns true when a row was removed. */
export function revokeFleetLeadScope(db: Database, userId: string, organizationId: string): boolean {
  return (
    db
      .prepare("DELETE FROM user_fleet_lead_scopes WHERE user_id = ? AND organization_id = ?")
      .run(userId, organizationId).changes > 0
  );
}

/**
 * Fleet lead for the org by role/scope only (no HR lookup). The caller's home org is
 * `user.organizationId` when given (VerifiedFleetUser), else the users row for the email.
 */
export function holdsFleetLeadForOrg(db: Database, organizationId: string, user: FleetCaller): boolean {
  const role = (user.role || "").toLowerCase();
  if (role === "superadmin") return true;
  if (!organizationId) return false;
  const row = findUserByEmail(db, user.email);
  const homeOrg = user.organizationId ?? row?.organization_id;
  if (role === "fleet_lead" && homeOrg === organizationId) return true;
  return !!row && hasFleetLeadScopeRow(db, row.id, organizationId);
}

/** Fleet lead for the org, including the HR-canonical fm:vehicle_allocator grant. */
export async function isFleetLeadForOrg(
  db: Database,
  organizationId: string,
  user: FleetCaller
): Promise<boolean> {
  if (holdsFleetLeadForOrg(db, organizationId, user)) return true;
  if (!user.email) return false;
  return hasHrFmApprovalRole(user.email, "vehicle_allocator", countryFromOrganization(db, organizationId));
}

/**
 * Fleet-management edits on an org's records: manager/admin as before (not org-limited),
 * otherwise the user must hold fleet lead for that org (no HR grant: fm:vehicle_allocator
 * is an allocation grant, not edit authority). A literal `fleet_lead` role therefore only
 * edits its own organization's records.
 */
export function isFleetManagementForOrg(db: Database, organizationId: string, user: FleetCaller): boolean {
  const role = (user.role || "").toLowerCase();
  if (role === "manager" || role === "admin") return true;
  return holdsFleetLeadForOrg(db, organizationId, user);
}
