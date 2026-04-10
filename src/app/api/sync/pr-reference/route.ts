import { NextRequest, NextResponse } from "next/server";
import { syncPrReferenceLists } from "@/lib/firestore-sync";

/**
 * POST /api/sync/pr-reference
 * READ-ONLY: Pulls PR Firestore reference lists into Fleet Hub SQLite:
 * - referenceData_sites → reference_data.type = site
 * - referenceData_departments → reference_data.type = department
 * Never writes to Firestore.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const result = await syncPrReferenceLists(org);
  const status = result.success ? 200 : 502;
  return NextResponse.json(result, { status });
}
