import { getAuth } from "firebase-admin/auth";
import { getFleetAdminApp } from "@/lib/firebase-admin-init";
import { getDb } from "@/lib/db";

export async function getVerifiedFleetUser(
  request: Request
): Promise<{ id: string; email: string; role: string; name: string } | null> {
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
        "SELECT id, email, role, name FROM users WHERE firebase_uid = ? AND is_active = 1"
      )
      .get(decoded.uid) as
      | { id: string; email: string; role: string; name: string }
      | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export function isFleetManagementRole(role: string): boolean {
  return role === "fleet_lead" || role === "manager" || role === "admin";
}

/** Personal vehicle reimbursement rate policy — only these roles may edit rates in Admin. */
export function isFinanceOrSuperAdmin(role: string): boolean {
  return role === "finance" || role === "superadmin";
}
