import { NextResponse } from "next/server";
import { verifyFleetUser } from "@/lib/server-auth";
import { getFirebaseAdminStatus } from "@/lib/firebase-admin-init";

/**
 * GET /api/me/whoami
 *
 * Debug + diagnostic endpoint. Tells the caller exactly how the server interpreted
 * their bearer token: verified user, or a specific failure reason (no bearer / bad
 * token / deactivated / auth unconfigured). Also echoes the Firebase Admin credential
 * source so operators can quickly see whether the env is healthy. Safe to expose —
 * echoes no PII beyond what the caller already proved they own.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { user, reason } = await verifyFleetUser(request);
  const admin = getFirebaseAdminStatus();
  const adminInfo = admin.ok
    ? { ok: true as const, source: admin.source }
    : { ok: false as const, error: admin.error, tried: admin.tried };
  if (user) {
    return NextResponse.json({ ok: true, user, admin: adminInfo });
  }
  return NextResponse.json(
    { ok: false, reason: reason ?? "bad_token", admin: adminInfo },
    { status: 401 }
  );
}
