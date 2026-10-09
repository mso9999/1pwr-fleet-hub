/**
 * Fleet Hub's users.role is the value allocate / fleet-lead checks read.
 * HR does not store that string. It stores a job title (current_position_title)
 * and a department. Login used to copy the purchase-request role (REQ / USER)
 * into users.role and then stopped writing role at all, so titles such as
 * "Fleet Lead" never landed.
 *
 * This mapping is the ongoing rule. A null result means HR has no fleet-job
 * opinion and the local role is left alone (managers, admins, superadmins).
 */

export type HrDerivedFleetRole = "fleet_lead" | "mechanic" | "driver";

const PROTECTED_LOCAL_ROLES = new Set(["superadmin", "admin"]);

export function normalizeHrLabel(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fleetRoleFromHrPosition(
  title: string | null | undefined,
  department: string | null | undefined,
): HrDerivedFleetRole | null {
  const job = normalizeHrLabel(title);
  if (!job) return null;
  if (job === "fleet lead" || job.endsWith(" fleet lead")) return "fleet_lead";

  const dept = normalizeHrLabel(department);
  const fleetDept = dept === "fleet" || dept.startsWith("fleet ");
  if (!fleetDept) return null;
  if (job.includes("mechanic")) return "mechanic";
  if (job === "driver" || job.startsWith("driver ")) return "driver";
  return null;
}

export interface HrFleetRoleEmployee {
  email: string;
  title: string | null;
  department: string | null;
}

export interface HrFleetRoleUser {
  email: string;
  role: string;
}

export interface HrFleetRoleChange {
  email: string;
  from: string;
  to: HrDerivedFleetRole;
}

/** Roles HR's job title implies. Superadmin and admin are never rewritten. */
export function planHrFleetRoleUpdates(
  users: HrFleetRoleUser[],
  employees: HrFleetRoleEmployee[],
): HrFleetRoleChange[] {
  const byEmail = new Map<string, HrFleetRoleEmployee>();
  for (const employee of employees) {
    const email = employee.email.trim().toLowerCase();
    if (email) byEmail.set(email, employee);
  }

  const changes: HrFleetRoleChange[] = [];
  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    const employee = byEmail.get(email);
    if (!employee) continue;
    const current = String(user.role || "").trim().toLowerCase();
    if (PROTECTED_LOCAL_ROLES.has(current)) continue;
    const next = fleetRoleFromHrPosition(employee.title, employee.department);
    if (!next || next === current) continue;
    // A manager who is also fleet lead keeps role manager (mission approval);
    // the fleet-lead capability comes from user_fleet_lead_scopes, which this
    // sync never touches.
    if (current === "manager" && next === "fleet_lead") continue;
    changes.push({ email, from: user.role, to: next });
  }
  return changes;
}
