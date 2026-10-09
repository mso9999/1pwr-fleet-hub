import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, isExecutiveRole, isFleetManagementRole } from "@/lib/server-auth";
import { actorFrom } from "@/lib/record-mutation-log";
import { returnSecondment } from "@/lib/vehicle-secondment";
import { pushVehicleRowToPr } from "@/lib/pr-vehicle-sync";

/**
 * POST /api/vehicles/[id]/secondment/return
 * Body: { note?: string }
 * Fleet management or executive ends an active secondment: the vehicle goes back to its
 * owner (organization_id, never changed by a secondment). Logged and re-synced to the PR mirror.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFleetManagementRole(user.role) && !isExecutiveRole(user.role)) {
    return NextResponse.json(
      { error: "Fleet lead, manager, admin, or executive role required to record a secondment return" },
      { status: 403 }
    );
  }

  const { id: vehicleId } = await params;
  const body = (await request.json().catch(() => ({}))) as { note?: unknown };
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const db = getDb();
  const result = db
    .transaction(() =>
      returnSecondment(db, { vehicleId, actor: actorFrom(user), note, now: new Date().toISOString() })
    )
    .immediate();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId) as Record<string, unknown>;
  await pushVehicleRowToPr(vehicle);
  return NextResponse.json({
    vehicle,
    returnedFrom: result.before.seconded_to_org,
    borrowerReservationsAfterReturn: result.borrowerReservationsAfterReturn,
  });
}
