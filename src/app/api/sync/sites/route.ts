import { NextRequest, NextResponse } from "next/server";
import { syncSitesFromFirestore } from "@/lib/firestore-sync";

/**
 * POST /api/sync/sites
 * READ-ONLY sync: fetches sites from shared Firestore referenceData_sites
 * into local SQLite reference_data. Never writes to Firestore.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const result = await syncSitesFromFirestore(org);
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
