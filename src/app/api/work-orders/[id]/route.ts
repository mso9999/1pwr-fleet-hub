import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  "submitted": ["queued", "rejected", "cancelled"],
  "queued": ["in-progress", "cancelled"],
  "in-progress": ["awaiting-parts", "completed", "cancelled"],
  "awaiting-parts": ["in-progress", "cancelled"],
  "completed": ["closed", "return-repair", "rejected"],
  "closed": ["return-repair"],
  "return-repair": ["queued", "in-progress"],
  "cancelled": [],
  "rejected": ["submitted"],
};

interface WORow {
  id: string;
  status: string;
  closing_inspection_id: string | null;
  [key: string]: unknown;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();

  const wo = db.prepare(`
    SELECT wo.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM work_orders wo
    JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.id = ?
  `).get(id) as WORow | undefined;

  if (!wo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Calculate days open
  const start = new Date(wo.downtime_start as string);
  const end = wo.downtime_end ? new Date(wo.downtime_end as string) : new Date();
  const daysOpen = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  // Fetch related data
  const statusHistory = db.prepare(
    "SELECT * FROM work_order_status_history WHERE work_order_id = ? ORDER BY changed_at ASC"
  ).all(id);

  const labor = db.prepare(
    "SELECT * FROM work_order_labor WHERE work_order_id = ? ORDER BY work_date DESC"
  ).all(id);

  const poLinks = db.prepare(
    "SELECT * FROM work_order_po_links WHERE work_order_id = ? ORDER BY created_at DESC"
  ).all(id);

  const parts = db.prepare(
    "SELECT * FROM parts WHERE work_order_id = ? ORDER BY rowid"
  ).all(id);

  return NextResponse.json({
    ...wo,
    days_open: daysOpen,
    status_history: statusHistory,
    labor,
    po_links: poLinks,
    parts,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();
  const now = new Date().toISOString();

  const existing = db.prepare("SELECT * FROM work_orders WHERE id = ?").get(id) as WORow | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Status transition validation
  if (body.status && body.status !== existing.status) {
    const allowed = VALID_TRANSITIONS[existing.status as string] || [];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${existing.status}' to '${body.status}'. Allowed: ${allowed.join(", ") || "none"}` },
        { status: 400 }
      );
    }

    // Close requires inspection
    if (body.status === "closed") {
      const inspectionId = body.closingInspectionId || existing.closing_inspection_id;
      if (!inspectionId) {
        return NextResponse.json(
          { error: "Closing a work order requires a closing inspection. Provide closingInspectionId." },
          { status: 400 }
        );
      }
      // Verify inspection exists
      const insp = db.prepare("SELECT id FROM inspections WHERE id = ?").get(inspectionId);
      if (!insp) {
        return NextResponse.json(
          { error: "Closing inspection not found." },
          { status: 400 }
        );
      }
    }

    // Set downtime_end on completion/close
    if (["completed", "closed"].includes(body.status) && !body.downtimeEnd) {
      body.downtimeEnd = now;
    }

    // Record status history
    db.prepare(`
      INSERT INTO work_order_status_history (work_order_id, from_status, to_status, changed_by_id, changed_by_name, reason, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, existing.status, body.status, body.changedById || "", body.changedByName || "", body.reason || "", now);
  }

  const allowedFields: Record<string, string> = {
    title: "title",
    description: "description",
    type: "type",
    priority: "priority",
    status: "status",
    assignedTo: "assigned_to",
    repairLocation: "repair_location",
    thirdPartyShop: "third_party_shop",
    validatedBy: "validated_by",
    closingInspectionId: "closing_inspection_id",
    remarks: "remarks",
    downtimeEnd: "downtime_end",
    partsCost: "parts_cost",
    labourCost: "labour_cost",
    thirdPartyCost: "third_party_cost",
  };

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [jsKey, dbCol] of Object.entries(allowedFields)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${dbCol} = ?`);
      values.push(body[jsKey]);
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE work_orders SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  // Recalculate costs from labor + parts + PO links
  recalculateCosts(db, id);

  const updated = db.prepare(`
    SELECT wo.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM work_orders wo JOIN vehicles v ON wo.vehicle_id = v.id WHERE wo.id = ?
  `).get(id);
  return NextResponse.json(updated);
}

function recalculateCosts(db: ReturnType<typeof getDb>, woId: string): void {
  const laborSum = db.prepare(
    "SELECT COALESCE(SUM(hours), 0) as total_hours, COALESCE(SUM(hours * rate_per_hour), 0) as total_cost FROM work_order_labor WHERE work_order_id = ?"
  ).get(woId) as { total_hours: number; total_cost: number };

  const partsSum = db.prepare(
    "SELECT COALESCE(SUM(quantity * COALESCE(unit_cost, 0)), 0) as total FROM parts WHERE work_order_id = ?"
  ).get(woId) as { total: number };

  const poSum = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM work_order_po_links WHERE work_order_id = ?"
  ).get(woId) as { total: number };

  const totalCost = partsSum.total + laborSum.total_cost + poSum.total;

  db.prepare(`
    UPDATE work_orders SET total_labour_hours = ?, parts_cost = ?, labour_cost = ?, third_party_cost = ?, total_cost = ?, updated_at = ?
    WHERE id = ?
  `).run(laborSum.total_hours, partsSum.total, laborSum.total_cost, poSum.total, totalCost, new Date().toISOString(), woId);
}
