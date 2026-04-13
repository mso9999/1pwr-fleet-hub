import { NextRequest, NextResponse } from "next/server";
import { countOperationalVehiclesInPool } from "@/lib/pvr-eligibility";
import { getDb } from "@/lib/db";
import { getPvrRateSnapshotForOrg } from "@/lib/pvr-rates";

/**
 * GET /api/personal-vehicle-reimbursements/eligibility?org=
 * Returns whether a personal-vehicle claim may be opened (no operational fleet vehicles available).
 */
export function GET(request: NextRequest): NextResponse {
  try {
    const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
    const db = getDb();
    const operationalCount = countOperationalVehiclesInPool(db, org);
    const eligible = operationalCount === 0;
    const rates = getPvrRateSnapshotForOrg(db, org);
    return NextResponse.json({
      eligible,
      operationalVehicleCount: operationalCount,
      rates,
      message: eligible
        ? "No fleet vehicles are currently available for assignment — you may submit a personal vehicle reimbursement claim."
        : `There ${operationalCount === 1 ? "is" : "are"} ${operationalCount} operational fleet vehicle(s) in the pool. Use a 1PWR vehicle or request one via Vehicle requests before claiming personal use.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/personal-vehicle-reimbursements/eligibility GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
