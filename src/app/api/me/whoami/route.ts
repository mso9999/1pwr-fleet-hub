import { NextResponse } from "next/server";
import { verifyFleetUser } from "@/lib/server-auth";

/**
 * GET /api/me/whoami
 *
 * Debug + diagnostic endpoint. Tells the caller exactly how the server interpreted
 * their bearer token: verified user, or a specific failure reason (no bearer / bad
 * token / deactivated / auth unconfigured). Safe to expose because it echoes no
 * more than the caller already proved they own.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { user, reason } = await verifyFleetUser(request);
  if (user) return NextResponse.json({ ok: true, user });
  return NextResponse.json({ ok: false, reason: reason ?? "bad_token" }, { status: 401 });
}
