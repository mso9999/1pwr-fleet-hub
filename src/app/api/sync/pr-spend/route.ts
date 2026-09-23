import { NextRequest, NextResponse } from "next/server";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { isFleetManagementRole } from "@/lib/fleet-roles";
import { syncVehiclePrSpendFromFirestore } from "@/lib/firestore-sync";

/**
 * POST /api/sync/pr-spend?org=1pwr_lesotho
 * READ-ONLY from Firestore: pull purchaseRequests that name an FM vehicle into
 * local pr_cost_cache (including PRs with no work-order link). Cron + admin.
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
  const authorizedByRole =
    !!user &&
    (isFleetManagementRole(user.role || "") || role === "superadmin" || role === "admin");
  if (!authorizedByRole && !hasCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = req.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const result = await syncVehiclePrSpendFromFirestore(org);
  return NextResponse.json(
    { ...result, ranAt: new Date().toISOString() },
    { status: result.success ? 200 : 502 }
  );
}
