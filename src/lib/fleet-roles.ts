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
