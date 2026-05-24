import { getAuth } from "firebase-admin/auth";
import { getFleetAdminApp } from "@/lib/firebase-admin-init";
import { getDb } from "@/lib/db";
import { verifyFirebaseIdToken } from "@/lib/verify-firebase-id-token";
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
  organizationId: string;
};

export type AuthFailure =
  | "auth_unconfigured" // server has no Firebase Admin credential loaded
  | "no_bearer" // request did not include Authorization: Bearer <token>
  | "bad_token" // token couldn't be verified (expired / wrong project / signature)
  | "deactivated"; // user exists in users table but is_active=0

export interface VerifyFleetUserResult {
  user: VerifiedFleetUser | null;
  reason?: AuthFailure;
}

/**
 * Verify a Fleet Hub request's bearer token and resolve it to a local users row.
 *
 * Token verification is performed WITHOUT requiring a service-account JSON on disk:
 * Firebase ID tokens are standard RS256 JWTs signed by Google and we verify them
 * against Google's published public keys in {@link verifyFirebaseIdToken}. If a
 * service-account file is present we prefer firebase-admin (it handles key rotation
 * and caching) but fall back to the stand-alone verifier so the auth path can never
 * silently fall back to "auth_unconfigured" just because PM2's env var went missing.
 *
 * Auto-provision: if the token verifies but no `users` row exists for that Firebase UID
 * (or email), we insert a minimal read-level row. This stops new sign-ins from being
 * stuck at "Unauthorized" when the client-side /api/users/sync POST silently failed —
 * anyone Firebase trusts can at least read.
 */
export async function verifyFleetUser(request: Request): Promise<VerifyFleetUserResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { user: null, reason: "no_bearer" };
  const idToken = authHeader.slice(7);

  let decoded: { uid: string; email?: string; name?: string; email_verified?: boolean } | null = null;

  // 1. Prefer firebase-admin when the service-account file is configured. It caches
  //    keys across requests and handles revocation via verifyIdToken(token, true).
  const app = getFleetAdminApp();
  if (app) {
    try {
      decoded = await getAuth(app).verifyIdToken(idToken);
    } catch {
      // firebase-admin refused it. We still try the JWKS path so a broken local cert
      // store or clock-skew issue doesn't deny access — the JWKS path is equally strict.
      decoded = null;
    }
  }

  // 2. Fall back to JWKS verification with node:crypto. No server-side credential needed.
  if (!decoded) {
    try {
      const verified = await verifyFirebaseIdToken(idToken);
      if (verified) {
        decoded = {
          uid: verified.uid,
          email: verified.email,
          name: verified.name,
          email_verified: verified.emailVerified,
        };
      }
    } catch (err) {
      console.error("[server-auth] JWKS verification error", err);
    }
  }

  if (!decoded) return { user: null, reason: "bad_token" };

  const db = getDb();
  const rowForUid = db
    .prepare(
      "SELECT id, email, role, name, IFNULL(department, '') AS department, IFNULL(organization_id, '1pwr_lesotho') AS organizationId, is_active FROM users WHERE firebase_uid = ?"
    )
    .get(decoded.uid) as (VerifiedFleetUser & { is_active: number }) | undefined;

  if (rowForUid) {
    if (!rowForUid.is_active) return { user: null, reason: "deactivated" };
    const { is_active: _ia, ...user } = rowForUid;
    return { user };
  }

  // No row yet for this UID; try email next, then auto-provision.
  const email = (decoded.email || "").trim();
  if (email) {
    const rowForEmail = db
      .prepare(
        "SELECT id, email, role, name, IFNULL(department, '') AS department, IFNULL(organization_id, '1pwr_lesotho') AS organizationId, is_active FROM users WHERE email = ?"
      )
      .get(email) as (VerifiedFleetUser & { is_active: number }) | undefined;
    if (rowForEmail) {
      if (!rowForEmail.is_active) return { user: null, reason: "deactivated" };
      // Link the existing email-only row to this Firebase UID so future calls resolve directly.
      db.prepare(
        "UPDATE users SET firebase_uid = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(decoded.uid, rowForEmail.id);
      const { is_active: _ia, ...user } = rowForEmail;
      return { user };
    }
  }

  // Auto-provision a minimal read-level user so a freshly-created Firebase account isn't
  // blocked from every verified endpoint just because /api/users/sync never fired.
  const name = (decoded.name || email || decoded.uid).toString();
  try {
    db.prepare(
      `INSERT INTO users (id, firebase_uid, email, name, role, department, organization_id, permission_level, is_active, updated_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'driver', '', '1pwr_lesotho', 5, 1, datetime('now'))`
    ).run(decoded.uid, email, name);
  } catch (err) {
    console.error("[server-auth] auto-provision failed", err);
    return { user: null, reason: "bad_token" };
  }
  const fresh = db
    .prepare(
      "SELECT id, email, role, name, IFNULL(department, '') AS department, IFNULL(organization_id, '1pwr_lesotho') AS organizationId FROM users WHERE firebase_uid = ?"
    )
    .get(decoded.uid) as VerifiedFleetUser | undefined;
  return { user: fresh ?? null };
}

/**
 * Back-compat shim. Existing callers only care about "user or null". New callers should
 * use {@link verifyFleetUser} directly so they can differentiate the failure reason.
 */
export async function getVerifiedFleetUser(request: Request): Promise<VerifiedFleetUser | null> {
  const { user } = await verifyFleetUser(request);
  return user;
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
