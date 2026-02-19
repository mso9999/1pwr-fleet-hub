import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const labor = db.prepare(
    "SELECT * FROM work_order_labor WHERE work_order_id = ? ORDER BY work_date DESC"
  ).all(id);
  return NextResponse.json(labor);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();

  const wo = db.prepare("SELECT id FROM work_orders WHERE id = ?").get(id);
  if (!wo) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

  const laborId = uuidv4();
  db.prepare(`
    INSERT INTO work_order_labor (id, work_order_id, worker_name, worker_id, role, hours, rate_per_hour, description, work_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    laborId,
    id,
    body.workerName || "",
    body.workerId || "",
    body.role || "mechanic",
    body.hours || 0,
    body.ratePerHour || 0,
    body.description || "",
    body.workDate || new Date().toISOString().split("T")[0]
  );

  // Recalculate totals on work order
  const laborSum = db.prepare(
    "SELECT COALESCE(SUM(hours), 0) as total_hours, COALESCE(SUM(hours * rate_per_hour), 0) as total_cost FROM work_order_labor WHERE work_order_id = ?"
  ).get(id) as { total_hours: number; total_cost: number };

  db.prepare(
    "UPDATE work_orders SET total_labour_hours = ?, labour_cost = ?, total_cost = parts_cost + ? + third_party_cost, updated_at = ? WHERE id = ?"
  ).run(laborSum.total_hours, laborSum.total_cost, laborSum.total_cost, new Date().toISOString(), id);

  const entry = db.prepare("SELECT * FROM work_order_labor WHERE id = ?").get(laborId);
  return NextResponse.json(entry, { status: 201 });
}
