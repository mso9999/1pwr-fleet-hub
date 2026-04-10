import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Deletes all tutorial demo rows: vehicles whose code starts with TUT- and dependent records.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { organizationId?: string };
  const organizationId = body.organizationId || "1pwr_lesotho";
  const db = getDb();

  const vehicles = db
    .prepare(`SELECT id FROM vehicles WHERE organization_id = ? AND code LIKE 'TUT-%'`)
    .all(organizationId) as Array<{ id: string }>;

  let deletedVehicles = 0;

  const run = db.transaction(() => {
    for (const { id: vehicleId } of vehicles) {
      const trips = db.prepare(`SELECT id FROM trips WHERE vehicle_id = ?`).all(vehicleId) as Array<{ id: string }>;
      for (const t of trips) {
        db.prepare(`DELETE FROM trip_stops WHERE trip_id = ?`).run(t.id);
      }
      db.prepare(`DELETE FROM trips WHERE vehicle_id = ?`).run(vehicleId);

      const woIds = db.prepare(`SELECT id FROM work_orders WHERE vehicle_id = ?`).all(vehicleId) as Array<{ id: string }>;
      for (const w of woIds) {
        db.prepare(`DELETE FROM parts WHERE work_order_id = ?`).run(w.id);
      }
      db.prepare(`DELETE FROM work_orders WHERE vehicle_id = ?`).run(vehicleId);

      db.prepare(`DELETE FROM inspections WHERE vehicle_id = ?`).run(vehicleId);
      db.prepare(`DELETE FROM driver_vehicle_checks WHERE vehicle_id = ?`).run(vehicleId);
      db.prepare(`DELETE FROM field_issue_reports WHERE vehicle_id = ?`).run(vehicleId);
      db.prepare(`DELETE FROM scheduled_maintenance WHERE vehicle_id = ?`).run(vehicleId);
      db.prepare(`DELETE FROM post_deployment_checks WHERE vehicle_id = ?`).run(vehicleId);
      db.prepare(`DELETE FROM vehicle_tracking_reports WHERE vehicle_id = ?`).run(vehicleId);
      db.prepare(`DELETE FROM vehicle_requests WHERE vehicle_id = ? OR assigned_vehicle_id = ?`).run(vehicleId, vehicleId);

      db.prepare(`DELETE FROM vehicles WHERE id = ?`).run(vehicleId);
      deletedVehicles++;
    }
  });

  try {
    run();
  } catch (e) {
    console.error("[tutorial/cleanup]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Cleanup failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, deletedVehicles });
}
