import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

/** Sort modes for the WO list. priority is the legacy default for the global page. */
type SortMode = "priority" | "completed" | "created" | "status";

function resolveSortMode(raw: string | null): SortMode {
  switch (raw) {
    case "completed":
    case "created":
    case "status":
      return raw;
    case "priority":
    default:
      return "priority";
  }
}

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const vehicleId = searchParams.get("vehicleId");
  const sort = resolveSortMode(searchParams.get("sort"));

  // completed_at = downtime_end if set, else the latest history row that took the WO into
  // completed/closed. Open WOs return NULL; the client groups them at the top.
  let query = `
    SELECT
      wo.*,
      v.code as vehicle_code,
      v.make as vehicle_make,
      v.model as vehicle_model,
      COALESCE(
        wo.downtime_end,
        (
          SELECT MAX(h.changed_at)
          FROM work_order_status_history h
          WHERE h.work_order_id = wo.id
            AND h.to_status IN ('completed', 'closed')
        )
      ) AS completed_at
    FROM work_orders wo
    JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.organization_id = ?
  `;
  const org = searchParams.get("org") || "1pwr_lesotho";
  const params: string[] = [org];

  if (status) {
    query += " AND wo.status = ?";
    params.push(status);
  }
  if (vehicleId) {
    query += " AND wo.vehicle_id = ?";
    params.push(vehicleId);
  }

  switch (sort) {
    case "completed":
      // Open WOs first (NULL completed_at), then most-recently completed.
      query += " ORDER BY (completed_at IS NULL) DESC, completed_at DESC, wo.created_at DESC";
      break;
    case "created":
      query += " ORDER BY wo.created_at DESC";
      break;
    case "status":
      query += " ORDER BY wo.status ASC, wo.created_at DESC";
      break;
    case "priority":
    default:
      query += " ORDER BY CASE wo.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, wo.created_at DESC";
      break;
  }

  const orders = db.prepare(query).all(...params);
  return NextResponse.json(orders);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const body = await request.json();
  const id = uuidv4();
  const now = new Date().toISOString();

  const initialStatus = body.status || "submitted";

  db.prepare(`
    INSERT INTO work_orders (id, organization_id, vehicle_id, title, description, type, priority, status, assigned_to, repair_location, third_party_shop, reported_by, remarks, downtime_start, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.organizationId || "1pwr_lesotho",
    body.vehicleId,
    body.title,
    body.description || "",
    body.type || "corrective",
    body.priority || "medium",
    initialStatus,
    body.assignedTo || "",
    body.repairLocation || "hq",
    body.thirdPartyShop || "",
    body.reportedBy || "",
    body.remarks || "",
    body.downtimeStart || now,
    now,
    now
  );

  // Record initial status in history
  db.prepare(`
    INSERT INTO work_order_status_history (work_order_id, from_status, to_status, changed_by_id, changed_by_name, reason, changed_at)
    VALUES (?, NULL, ?, ?, ?, 'Work order created', ?)
  `).run(id, initialStatus, body.reportedById || "", body.reportedBy || "", now);

  const order = db.prepare(`
    SELECT wo.*, v.code as vehicle_code FROM work_orders wo JOIN vehicles v ON wo.vehicle_id = v.id WHERE wo.id = ?
  `).get(id);
  return NextResponse.json(order, { status: 201 });
}
