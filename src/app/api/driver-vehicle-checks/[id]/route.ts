import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare(`
    SELECT dvc.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM driver_vehicle_checks dvc
    JOIN vehicles v ON dvc.vehicle_id = v.id
    WHERE dvc.id = ?
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

  const existing = db.prepare("SELECT * FROM driver_vehicle_checks WHERE id = ?").get(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowedFields: Record<string, string> = {
    tripId: "trip_id",
    driverName: "driver_name",
    mileageKm: "mileage_km",
    checkDate: "check_date",
    routeFrom: "route_from",
    routeTo: "route_to",
    direction: "direction",
    remarks: "remarks",
    failureDescriptions: "failure_descriptions",
    electricsFrontLights: "electrics_front_lights",
    electricsRearLights: "electrics_rear_lights",
    electricsIndicators: "electrics_indicators",
    electricsBrakeLights: "electrics_brake_lights",
    electricsHorn: "electrics_horn",
    electricsWindows: "electrics_windows",
    electricsCentralLocking: "electrics_central_locking",
    electricsWipers: "electrics_wipers",
    electricsDashboardGauges: "electrics_dashboard_gauges",
    electricsAcHeating: "electrics_ac_heating",
    fluidsEngineOil: "fluids_engine_oil",
    fluidsEngineCoolant: "fluids_engine_coolant",
    fluidsPowerSteering: "fluids_power_steering",
    fluidsTransmission: "fluids_transmission",
    fluidsFuel: "fluids_fuel",
    driveSteering: "drive_steering",
    driveBrakes: "drive_brakes",
    driveTirePressure: "drive_tire_pressure",
    visualSpareWheelCondition: "visual_spare_wheel_condition",
    visualDoors: "visual_doors",
    equipJack: "equip_jack",
    equipSpareWheel: "equip_spare_wheel",
    equipTriangle: "equip_triangle",
    equipJumpLeads: "equip_jump_leads",
    equipFireExtinguisher: "equip_fire_extinguisher",
    equipPhoneCharger: "equip_phone_charger",
    equipFirstAidKit: "equip_first_aid_kit",
    equipFlashlight: "equip_flashlight",
    equipToolWheelSpanners: "equip_tool_wheel_spanners",
    equipToolMultimeter: "equip_tool_multimeter",
    equipToolCableCutters: "equip_tool_cable_cutters",
    equipToolPliers: "equip_tool_pliers",
    equipToolTowStraps: "equip_tool_tow_straps",
    equipToolInverter: "equip_tool_inverter",
    hasExceptions: "has_exceptions",
    exceptionItems: "exception_items",
    overallPass: "overall_pass",
  };

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [jsKey, dbCol] of Object.entries(allowedFields)) {
    if (body[jsKey] !== undefined) {
      let val = body[jsKey];
      if (dbCol === "failure_descriptions" || dbCol === "exception_items") {
        val = typeof val === "string" ? val : JSON.stringify(val);
      }
      fields.push(`${dbCol} = ?`);
      values.push(val);
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE driver_vehicle_checks SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  const updated = db.prepare(`
    SELECT dvc.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM driver_vehicle_checks dvc
    JOIN vehicles v ON dvc.vehicle_id = v.id
    WHERE dvc.id = ?
  `).get(id);

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";

  const result = db.prepare(
    "DELETE FROM driver_vehicle_checks WHERE id = ? AND organization_id = ?"
  ).run(id, org);

  if (result.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
