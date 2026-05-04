import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";
import { addWorkOrderPoLink } from "@/lib/work-order-po-links";
import { cachePRStatusForWorkOrder } from "@/lib/firestore-sync";

/**
 * POST /api/integrations/v1/work-orders/[id]/pr-links
 * Same payload as `POST /api/work-orders/[id]/po-links` but integration-key only (no Fleet session).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const body = await request.json();

  const historyActor = { id: "integration", name: "PR integration" };
  const result = addWorkOrderPoLink(db, id, body, historyActor);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const entry = db.prepare("SELECT * FROM work_order_po_links WHERE id = ?").get(result.linkId) as
    | Record<string, unknown>
    | undefined;
  if (!entry) {
    return NextResponse.json({ error: "Link row missing after insert" }, { status: 500 });
  }
  let prCache: Awaited<ReturnType<typeof cachePRStatusForWorkOrder>>;
  try {
    prCache = await cachePRStatusForWorkOrder(id);
  } catch {
    prCache = { success: false, upserted: 0, deactivated: 0, error: "pr_cache_failed" };
  }

  return NextResponse.json(
    {
      ...entry,
      work_order_status_after: result.workOrderStatusAfter,
      advanced_from_needs_parts: result.advancedFromNeedsParts,
      pr_cache: prCache,
    },
    { status: 201 }
  );
}
