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
    const eligible = true;
    const rates = getPvrRateSnapshotForOrg(db, org);
    return NextResponse.json({
      eligible,
      requiresApprovedMission: true,
      operationalVehicleCount: operationalCount,
      /** When &gt; 0, submit (and any later approval) requires override documentation in Notes. */
      requiresVehicleAvailabilityOverrideNotes: operationalCount > 0,
      rates,
      message:
        operationalCount === 0
          ? "No fleet vehicles are currently available for assignment — you may submit a personal vehicle reimbursement claim. You must link the claim to an approved, active Fleet Hub mission, and the trip date must fall within that mission’s dates."
          : `There ${operationalCount === 1 ? "is" : "are"} ${operationalCount} operational fleet vehicle(s) in the pool. You may still submit a personal-vehicle claim only if Notes document a formal override (why a 1PWR vehicle was not used). Managers cannot approve without that override text when vehicles were available at submit time.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/personal-vehicle-reimbursements/eligibility GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
