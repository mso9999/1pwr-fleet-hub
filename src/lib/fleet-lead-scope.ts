/**
 * Country-scoped fleet-lead capability.
 *
 * "Fleet lead" is a capability held per organization, separate from users.role, so one
 * person can be a manager (mission approver) AND the fleet lead for their own country.
 *
 * A user is fleet lead for org X when ANY of:
 *   - role is superadmin (global);
 *   - a user_fleet_lead_scopes row exists for (user, X);
 *   - legacy: role is literally 'fleet_lead' AND users.organization_id = X;
 *   - HR grants fm:vehicle_allocator for X's country (or globally) — async check only.
 *
 * The local checks are sync and DB-only; {@link isFleetLeadForOrg} adds the HR grant.
 */
import type { Database } from "better-sqlite3";
import { countryFromOrganization, hasHrFmApprovalRole } from "@/lib/hr-approval-roles";

const DEFAULT_ORG = "1pwr_lesotho";

export interface FleetLeadScopeRow {
  user_id: string;
  organization_id: string;
  granted_by: string;
  granted_at: string;
  email: string;
  name: string;
}

function lookupUser(db: Database, email: string): { id: string; organization_id: string } | undefined {
  const n = (email || "").trim().toLowerCase();
  if (!n) return undefined;
  return db
    .prepare(
      `SELECT id, IFNULL(organization_id, '${DEFAULT_ORG}') AS organization_id
       FROM users WHERE lower(trim(email)) = ?`
    )
    .get(n) as { id: string; organization_id: string } | undefined;
}

export function hasFleetLeadScopeRow(db: Database, userId: string, organizationId: string): boolean {
  return !!db
    .prepare("SELECT 1 AS ok FROM user_fleet_lead_scopes WHERE user_id = ? AND organization_id = ?")
    .get(userId, organizationId);
}

export function listFleetLeadScopes(db: Database): FleetLeadScopeRow[] {
  return db
    .prepare(
      `SELECT s.user_id, s.organization_id, s.granted_by, s.granted_at, u.email, u.name
       FROM user_fleet_lead_scopes s JOIN users u ON u.id = s.user_id
       ORDER BY s.organization_id, u.email`
    )
    .all() as FleetLeadScopeRow[];
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

/** Fleet lead for the org by role/scope only (no HR lookup). */
export function holdsFleetLeadForOrg(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): boolean {
  const role = (userRole || "").toLowerCase();
  if (role === "superadmin") return true;
  if (!organizationId) return false;
  const u = lookupUser(db, userEmail);
  if (!u) return false;
  if (hasFleetLeadScopeRow(db, u.id, organizationId)) return true;
  return role === "fleet_lead" && u.organization_id === organizationId;
}

/** Fleet lead for the org, including the HR-canonical fm:vehicle_allocator grant. */
export async function isFleetLeadForOrg(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): Promise<boolean> {
  if (holdsFleetLeadForOrg(db, organizationId, userEmail, userRole)) return true;
  if (!userEmail) return false;
  return hasHrFmApprovalRole(userEmail, "vehicle_allocator", countryFromOrganization(db, organizationId));
}

/**
 * Fleet-management edits on an org's records: manager/admin/superadmin as before
 * (not org-limited), otherwise the user must be fleet lead for that org (no HR grant:
 * fm:vehicle_allocator is an allocation grant, not edit authority).
 */
export function isFleetManagementForOrg(
  db: Database,
  organizationId: string,
  userEmail: string,
  userRole: string
): boolean {
  const role = (userRole || "").toLowerCase();
  if (role === "manager" || role === "admin") return true;
  return holdsFleetLeadForOrg(db, organizationId, userEmail, userRole);
}
