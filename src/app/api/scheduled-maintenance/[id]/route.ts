import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare(`
    SELECT sm.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM scheduled_maintenance sm
    JOIN vehicles v ON sm.vehicle_id = v.id
    WHERE sm.id = ?
  `).get(id);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();
  const now = new Date().toISOString();

  const existing = db.prepare("SELECT * FROM scheduled_maintenance WHERE id = ?").get(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowedFields: Record<string, string> = {
    maintenanceType: "maintenance_type",
    description: "description",
    intervalKm: "interval_km",
    intervalMonths: "interval_months",
    lastPerformedDate: "last_performed_date",
    lastPerformedKm: "last_performed_km",
    nextDueDate: "next_due_date",
    nextDueKm: "next_due_km",
    status: "status",
    workOrderId: "work_order_id",
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

  db.prepare(`UPDATE scheduled_maintenance SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  if (body.status && body.status !== (existing as Record<string, unknown>).status) {
    db.prepare(
      "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("scheduled_maintenance", id, (existing as Record<string, unknown>).status, body.status, body.changedBy || "", now);
  }

  const updated = db.prepare(`
    SELECT sm.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM scheduled_maintenance sm
    JOIN vehicles v ON sm.vehicle_id = v.id
    WHERE sm.id = ?
  `).get(id);

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const result = db.prepare("DELETE FROM scheduled_maintenance WHERE id = ?").run(id);
  if (result.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
