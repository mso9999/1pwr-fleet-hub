import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncFleetRolesFromHr } from "@/lib/hr-fleet-role-sync";
import { getVerifiedFleetUser } from "@/lib/server-auth";

/**
 * POST /api/sync/hr-fleet-roles
 * Sets users.role from the HR job title (Fleet Lead, mechanic, driver).
 * Daily via the stale-approvals cron, and on each sign-in for that user.
 * This route is the on-demand run. Superadmin or the cron secret.
 */
function hasCronSecret(req: NextRequest): boolean {
  const expected = String(process.env.DRAFT_CLEANUP_SECRET || "").trim();
  if (!expected) return false;
  const provided =
    req.headers.get("x-api-key")?.trim() || req.nextUrl.searchParams.get("key")?.trim() || "";
  return provided !== "" && provided === expected;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(req);
  const role = String(user?.role || "").toLowerCase();
  if (role !== "superadmin" && !hasCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fleetRoles = await syncFleetRolesFromHr(getDb());
  return NextResponse.json({ success: true, fleetRoles, ranAt: new Date().toISOString() });
}
