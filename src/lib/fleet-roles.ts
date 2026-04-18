/** Shared role checks for fleet UI and API (keep in sync with business rules). */

export function isFleetManagementRole(role: string): boolean {
  return role === "fleet_lead" || role === "manager" || role === "admin";
}

export function isExecutiveRole(role: string): boolean {
  const r = (role || "").toLowerCase();
  return r === "executive" || r === "ceo" || r === "cfo" || r === "coo" || r === "superadmin";
}

export function isFinanceOrSuperAdmin(role: string): boolean {
  return role === "finance" || role === "superadmin";
}

/**
 * True when the user’s department (synced from PR) is EHS — same option as in the PR system.
 * Uses a word match so values like "EHS" or "EHS & Security" count.
 */
export function isEhsDepartment(department: string | null | undefined): boolean {
  const d = String(department ?? "").trim();
  if (!d) return false;
  return /\behs\b/i.test(d);
}

/**
 * True when the user’s department (synced from PR) is the Fleet team — word match so
 * values like "Fleet", "Fleet Team", or "Operations — Fleet" count.
 */
export function isFleetTeamDepartment(department: string | null | undefined): boolean {
  const d = String(department ?? "").trim();
  if (!d) return false;
  return /\bfleet\b/i.test(d);
}

/**
 * Move a work order through its workflow (status transitions). Limited to Fleet team
 * department affiliation in PR, plus superadmin for break-glass access.
 */
export function canAdvanceWorkOrderStatus(role: string, department?: string | null): boolean {
  const r = (role || "").toLowerCase();
  if (r === "superadmin") return true;
  return isFleetTeamDepartment(department);
}

/**
 * Create/update/delete rows on the EHS approved driver register (license scans + test dates).
 * Admins, superadmins, optional ehs_manager role, or anyone with EHS as their PR department.
 */
export function canManageEhsApprovedDrivers(role: string, department?: string | null): boolean {
  const r = (role || "").toLowerCase();
  if (r === "admin" || r === "superadmin" || r === "ehs_manager") return true;
  return isEhsDepartment(department);
}

/** View the register (fleet management read-only; EHS staff can edit via canManage). */
export function canViewEhsApprovedDrivers(role: string, department?: string | null): boolean {
  return canManageEhsApprovedDrivers(role, department) || isFleetManagementRole(role);
}
