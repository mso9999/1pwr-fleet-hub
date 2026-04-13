import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare(`
    SELECT vr.*,
           av.code as assigned_vehicle_code, av.make as assigned_vehicle_make, av.model as assigned_vehicle_model
    FROM vehicle_requests vr
    LEFT JOIN vehicles av ON vr.assigned_vehicle_id = av.id
    WHERE vr.id = ?
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
  const user = await getVerifiedFleetUser(request);

  const existing = db.prepare("SELECT * FROM vehicle_requests WHERE id = ?").get(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existingStatus = (existing as Record<string, unknown>).status as string;
  if (
    user &&
    body.status !== undefined &&
    body.status !== existingStatus &&
    ["approved", "rejected", "assigned"].includes(String(body.status))
  ) {
    body.approvedById = user.id;
    body.approvedByName = user.name || user.email;
  }

  const allowed: Record<string, string> = {
    status: "status",
    approvedById: "approved_by_id",
    approvedByName: "approved_by_name",
    rejectionReason: "rejection_reason",
    assignedVehicleId: "assigned_vehicle_id",
    notes: "notes",
    purpose: "purpose",
    destination: "destination",
    departureDate: "departure_date",
    returnDate: "return_date",
    passengers: "passengers",
    requiredVehicleClass: "required_vehicle_class",
    loadoutDescription: "loadout_description",
    priority: "priority",
  };

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [jsKey, dbCol] of Object.entries(allowed)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${dbCol} = ?`);
      values.push(body[jsKey]);
    }
  }

  if (fields.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE vehicle_requests SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  if (body.status && body.status !== (existing as Record<string, unknown>).status) {
    const actor =
      user?.name || user?.email || String(body.approvedByName || body.changedBy || "");
    db.prepare(
      "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("vehicle_request", id, (existing as Record<string, unknown>).status, body.status, actor, now);
  }

  const updated = db.prepare(`
    SELECT vr.*,
           av.code as assigned_vehicle_code, av.make as assigned_vehicle_make, av.model as assigned_vehicle_model
    FROM vehicle_requests vr
    LEFT JOIN vehicles av ON vr.assigned_vehicle_id = av.id
    WHERE vr.id = ?
  `).get(id);

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const result = db.prepare("DELETE FROM vehicle_requests WHERE id = ?").run(id);
  if (result.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
