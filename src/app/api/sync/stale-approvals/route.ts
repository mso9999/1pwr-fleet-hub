import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { isFleetManagementRole } from "@/lib/fleet-roles";
import { runStaleApprovalTimeout } from "@/lib/stale-approval-job";
import { runStaleNoTripCleanup } from "@/lib/stale-no-trip-job";
import { runStaleAllocationCleanup } from "@/lib/stale-allocation-job";
import { syncFleetRolesFromHr } from "@/lib/hr-fleet-role-sync";

/**
 * POST /api/sync/stale-approvals
 * Warns at 20 days and rejects at 30 days for missions (and standalone vehicle
 * requests) that are still waiting for approval. A request is never rejected
 * on the same run that first warns it. Also reminds requestors of approved
 * missions with no trip (7, 3, 1 day left) and clears them 14 days after
 * approval, and warns (7 days) then cancels (14 days) vehicle requests on
 * approved missions that never get a vehicle. Requests left behind on missions
 * that are already cleared, cancelled, or rejected are cancelled on sight.
 * Daily GitHub Actions cron, or an admin.
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
  const authorizedByRole = !!user && (isFleetManagementRole(user.role || "") || role === "superadmin" || role === "admin");
  if (!authorizedByRole && !hasCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const summary = await runStaleApprovalTimeout(db);
  const noTrip = await runStaleNoTripCleanup(db);
  const allocation = await runStaleAllocationCleanup(db);
  let fleetRoles: { email: string; from: string; to: string }[] = [];
  try {
    fleetRoles = await syncFleetRolesFromHr(db);
  } catch (err) {
    console.error("[stale-approvals] HR fleet role sync", err);
  }
  return NextResponse.json({ success: true, ...summary, noTrip, allocation, fleetRoles, ranAt: new Date().toISOString() });
}
