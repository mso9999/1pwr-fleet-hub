import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";

/**
 * GET /api/integrations/v1/work-orders
 * List work orders for the PR app's WO picker / validation.
 * Auth: `X-Fleet-Integration-Key` matching `FLEET_INTEGRATION_API_KEY` (≥12 chars).
 *
 * Query:
 *   org        (default 1pwr_lesotho)
 *   vehicleId  optional — only WOs for this FM vehicle UUID
 *   status     optional — single status or comma list; `open` expands to the
 *              non-terminal set (queued, submitted, in-progress, needs-parts,
 *              pr-submitted, awaiting-parts, return-repair)
 *   limit      optional, default 100, max 200
 */
const OPEN_STATUSES = [
  "queued",
  "submitted",
  "in-progress",
  "needs-parts",
  "pr-submitted",
  "awaiting-parts",
  "return-repair",
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";
  const vehicleId = (searchParams.get("vehicleId") || "").trim();
  const statusRaw = (searchParams.get("status") || "").trim();
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || "100") || 100));

  const statuses = statusRaw
    ? statusRaw.toLowerCase() === "open"
      ? OPEN_STATUSES
      : statusRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  let sql = `
    SELECT wo.id, wo.organization_id as organizationId, wo.vehicle_id as vehicleId,
           wo.title, wo.description, wo.type, wo.priority, wo.status,
           wo.total_cost as totalCost, wo.total_labour_hours as totalLabourHours,
           wo.downtime_start as downtimeStart, wo.downtime_end as downtimeEnd,
           wo.created_at as createdAt, wo.updated_at as updatedAt,
           v.code as vehicleCode, v.make as vehicleMake, v.model as vehicleModel
    FROM work_orders wo
    JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.organization_id = ?
  `;
  const params: string[] = [org];
  if (vehicleId) {
    sql += " AND wo.vehicle_id = ?";
    params.push(vehicleId);
  }
  if (statuses.length > 0) {
    sql += ` AND wo.status IN (${statuses.map(() => "?").join(", ")})`;
    params.push(...statuses);
  }
  sql += " ORDER BY datetime(wo.created_at) DESC LIMIT ?";
  params.push(String(limit));

  const db = getDb();
  const rows = db.prepare(sql).all(...params);
  return NextResponse.json({ organizationId: org, count: rows.length, workOrders: rows });
}
