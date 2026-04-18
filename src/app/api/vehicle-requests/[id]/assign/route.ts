import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canAllocateFleetVehicle } from "@/lib/vehicle-check-approvers";
import { recalculateVehicleRequestFuel } from "@/lib/vehicle-request-fuel";
import { VR_SELECT_FIELDS, VR_FROM_JOIN } from "@/lib/vehicle-request-queries";

/**
 * POST /api/vehicle-requests/[id]/assign
 *
 * Fleet team lead assigns a vehicle from the operational pool
 * and moves the request to 'assigned' status.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();
  const now = new Date().toISOString();
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAllocateFleetVehicle(user.role)) {
    return NextResponse.json(
      { error: "Only the fleet team lead (or superadmin) may allocate vehicles to requests." },
      { status: 403 }
    );
  }
  const approverId = user.id;
  const approverName = user.name || user.email;

  const existing = db.prepare("SELECT * FROM vehicle_requests WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!body.vehicleId) {
    return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
  }

  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(body.vehicleId) as Record<string, unknown> | undefined;
  if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  if (vehicle.status !== "operational") {
    return NextResponse.json({ error: `Vehicle ${vehicle.code} is not operational (status: ${vehicle.status})` }, { status: 400 });
  }

  const oldStatus = existing.status as string;

  db.prepare(`
    UPDATE vehicle_requests
    SET assigned_vehicle_id = ?, status = 'assigned',
        approved_by_id = ?, approved_by_name = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    body.vehicleId,
    approverId,
    approverName,
    now,
    id
  );

  db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("vehicle_request", id, oldStatus, "assigned", approverName, now);

  await recalculateVehicleRequestFuel(db, id);

  const updated = db.prepare(`
    SELECT ${VR_SELECT_FIELDS}
    ${VR_FROM_JOIN}
    WHERE vr.id = ?
  `).get(id);

  return NextResponse.json(updated);
}
