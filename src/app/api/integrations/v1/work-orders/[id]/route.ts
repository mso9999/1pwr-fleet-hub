import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";

/**
 * GET /api/integrations/v1/work-orders/[id]
 * Read-only work order summary for the PR app (validate before creating a PR line).
 * Auth: `X-Fleet-Integration-Key` matching `FLEET_INTEGRATION_API_KEY` (≥12 chars).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const row = db
    .prepare(`
    SELECT wo.id, wo.organization_id as organizationId, wo.vehicle_id as vehicleId, wo.title, wo.description,
           wo.type, wo.priority, wo.status, wo.downtime_start as downtimeStart, wo.downtime_end as downtimeEnd,
           wo.created_at as createdAt, wo.updated_at as updatedAt,
           v.code as vehicleCode, v.make as vehicleMake, v.model as vehicleModel
    FROM work_orders wo
    JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.id = ?
  `)
    .get(id) as Record<string, unknown> | undefined;

  if (!row) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}
