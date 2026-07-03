import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canAdvanceWorkOrderStatus } from "@/lib/fleet-roles";

/**
 * POST /api/work-orders/[id]/parts — add a part line to a work order.
 * DELETE /api/work-orders/[id]/parts?partId=... — remove a part line.
 *
 * Fleet department (or superadmin) only — same gate as status transitions.
 * On any change, work_orders.parts_cost is recalculated from all part lines.
 */
function recalcPartsCost(db: ReturnType<typeof getDb>, workOrderId: string): void {
  const row = db
    .prepare("SELECT COALESCE(SUM(quantity * unit_cost), 0) AS sum FROM parts WHERE work_order_id = ?")
    .get(workOrderId) as { sum: number };
  const partsCost = Number(row.sum ?? 0);
  db.prepare(
    `UPDATE work_orders
     SET parts_cost = ?,
         total_cost = (COALESCE(parts_cost, 0) + COALESCE(labour_cost, 0) + COALESCE(third_party_cost, 0)),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(partsCost, workOrderId);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAdvanceWorkOrderStatus(user.role, user.department)) {
    return NextResponse.json(
      { error: "Only Fleet department (or superadmin) may add parts." },
      { status: 403 }
    );
  }
  const body = (await request.json()) as Record<string, unknown>;
  const description = String(body.description || "").trim();
  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  const quantity = Math.max(1, parseInt(String(body.quantity ?? "1"), 10) || 1);
  const unitCost = Number(body.unitCost ?? body.unit_cost ?? 0) || 0;
  const supplier = String(body.supplier || "").trim();
  const prStatus = String(body.prStatus || body.pr_status || "needed").trim().toLowerCase();
  const deliveryEta = String(body.deliveryEta || body.delivery_eta || "").trim();
  const db = getDb();

  const wo = db.prepare("SELECT id, organization_id FROM work_orders WHERE id = ?").get(id) as { id: string; organization_id: string } | undefined;
  if (!wo) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  const partId = uuidv4();
  db.prepare(
    `INSERT INTO parts (id, work_order_id, description, quantity, unit_cost, supplier, pr_status, delivery_eta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(partId, id, description, quantity, unitCost, supplier, prStatus, deliveryEta);
  recalcPartsCost(db, id);
  return NextResponse.json({ id: partId }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAdvanceWorkOrderStatus(user.role, user.department)) {
    return NextResponse.json(
      { error: "Only Fleet department (or superadmin) may remove parts." },
      { status: 403 }
    );
  }
  const partId = request.nextUrl.searchParams.get("partId") || "";
  if (!partId) {
    return NextResponse.json({ error: "partId query param is required" }, { status: 400 });
  }
  const db = getDb();
  const result = db.prepare("DELETE FROM parts WHERE id = ? AND work_order_id = ?").run(partId, id);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Part not found for this work order" }, { status: 404 });
  }
  recalcPartsCost(db, id);
  return NextResponse.json({ ok: true });
}
