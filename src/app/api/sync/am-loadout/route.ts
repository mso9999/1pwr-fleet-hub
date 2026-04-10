import { NextRequest, NextResponse } from "next/server";
import { fetchAMAllocations } from "@/lib/firestore-sync";

/**
 * POST /api/sync/am-loadout
 * READ-ONLY: fetches AM asset allocations from shared Firestore am_core_allocations.
 * Returns data in-memory for display. Never writes to AM collections.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const allocationIds = body.allocationIds || [];

  if (!Array.isArray(allocationIds) || allocationIds.length === 0) {
    return NextResponse.json({ success: true, allocations: [] });
  }

  const result = await fetchAMAllocations(allocationIds);
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
