import { getAuth } from "firebase-admin/auth";
import { getFleetAdminApp } from "@/lib/firebase-admin-init";
import { getDb } from "@/lib/db";
import {
  canManageEhsApprovedDrivers as manageEhsDrivers,
  isExecutiveRole as execRole,
  isFinanceOrSuperAdmin as financeOrSuper,
  isFleetManagementRole as fleetMgmt,
  canViewEhsApprovedDrivers as viewEhsDrivers,
  canViewEhsApprovedDriversRegister as viewEhsRegister,
  canManageFleetMechanics as manageFleetMechs,
  canViewFleetMechanicsRegister as viewFleetMechs,
} from "@/lib/fleet-roles";

export type VerifiedFleetUser = {
  id: string;
  email: string;
  role: string;
  name: string;
  department: string;
};

export async function getVerifiedFleetUser(request: Request): Promise<VerifiedFleetUser | null> {
  const app = getFleetAdminApp();
  if (!app) return null;
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.slice(7);
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    const db = getDb();
    const row = db
      .prepare(
        "SELECT id, email, role, name, IFNULL(department, '') AS department FROM users WHERE firebase_uid = ? AND is_active = 1"
      )
      .get(decoded.uid) as VerifiedFleetUser | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export function isFleetManagementRole(role: string): boolean {
  return fleetMgmt(role);
}

/** Personal vehicle reimbursement rate policy — only these roles may edit rates in Admin. */
export function isFinanceOrSuperAdmin(role: string): boolean {
  return financeOrSuper(role);
}

/** C-level / executive sign-off for cross-country transfers (secondment or permanent). */
export function isExecutiveRole(role: string): boolean {
  return execRole(role);
}

export function canManageEhsApprovedDrivers(
  role: string,
  department?: string | null
): boolean {
  return manageEhsDrivers(role, department);
}

export function canViewEhsApprovedDrivers(role: string, department?: string | null): boolean {
  return viewEhsDrivers(role, department);
}

/** Anyone signed in can see the approved-drivers register (read-only). */
export function canViewEhsApprovedDriversRegister(
  role: string,
  department?: string | null
): boolean {
  return viewEhsRegister(role, department);
}

/** Admin / fleet management / DPO / HR / IT / Fleet department may curate fleet mechanics. */
export function canManageFleetMechanics(
  role: string,
  department?: string | null
): boolean {
  return manageFleetMechs(role, department);
}

/** Anyone signed in can see the fleet mechanics roster. */
export function canViewFleetMechanicsRegister(
  role: string,
  department?: string | null
): boolean {
  return viewFleetMechs(role, department);
}
