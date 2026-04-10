import { NextRequest, NextResponse } from "next/server";
import { cachePRStatusForWorkOrder } from "@/lib/firestore-sync";

/**
 * POST /api/sync/pr-cache?workOrderId=...
 * READ-ONLY: caches PR status from shared Firestore purchaseRequests
 * into local pr_cost_cache table. Never writes to Firestore.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const woId = request.nextUrl.searchParams.get("workOrderId");
  if (!woId) {
    return NextResponse.json({ error: "workOrderId query param required" }, { status: 400 });
  }
  const result = await cachePRStatusForWorkOrder(woId);
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
