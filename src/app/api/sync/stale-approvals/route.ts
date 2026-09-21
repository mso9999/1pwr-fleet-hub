import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { isFleetManagementRole } from "@/lib/fleet-roles";
import { runStaleApprovalTimeout } from "@/lib/stale-approval-job";

/**
 * POST /api/sync/stale-approvals
 * Warns at 20 days and rejects at 30 days for missions (and standalone vehicle
 * requests) that are still waiting for approval. A request is never rejected
 * on the same run that first warns it. Daily GitHub Actions cron, or an admin.
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

  const summary = await runStaleApprovalTimeout(getDb());
  return NextResponse.json({ success: true, ...summary, ranAt: new Date().toISOString() });
}
