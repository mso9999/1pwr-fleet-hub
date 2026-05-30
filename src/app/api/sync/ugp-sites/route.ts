import { NextRequest, NextResponse } from "next/server";
import { syncSitesFromUgp } from "@/lib/ugp-site-sync";
import { getVerifiedFleetUser, isFleetManagementRole } from "@/lib/server-auth";

/**
 * POST /api/sync/ugp-sites
 * Pull country-aware site codes from UGP (/cc/config/*), then upsert
 * Fleet Hub site reference rows, including GPS where available.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(req);
  if (!user || (!isFleetManagementRole(user.role) && user.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: user ? 403 : 401 });
  }
  const result = await syncSitesFromUgp();
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
