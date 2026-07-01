import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";

function dvcAudit(r: Record<string, unknown>): Record<string, unknown> {
  return {
    vehicle_id: r.vehicle_id,
    overall_pass: r.overall_pass,
    direction: r.direction,
    check_date: r.check_date,
    route_from: r.route_from,
    route_to: r.route_to,
  };
}

interface ManifestPassenger {
  employee_id: string;
  name: string;
  department?: string | null;
  country?: string | null;
}

/**
 * Normalize the incoming passenger manifest into a stable JSON shape.
 * Mirrors the normalization in POST /api/driver-vehicle-checks so PATCH
 * edits land in the same canonical form. Free-text entries without an
 * employee_id are rejected so the manifest can never contain ambiguous
 * names — the HR deployments API joins on employee_id exact match.
 */
function normalizePassengerManifest(raw: unknown): ManifestPassenger[] {
  if (!Array.isArray(raw)) return [];
  const out: ManifestPassenger[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const employeeId = String(o.employee_id ?? o.employeeId ?? "").trim();
    if (!employeeId) continue;
    if (seen.has(employeeId)) continue;
    seen.add(employeeId);
    out.push({
      employee_id: employeeId,
      name: String(o.name ?? "").trim(),
      department: o.department != null ? String(o.department) : null,
      country: o.country != null ? String(o.country) : null,
    });
  }
  return out;
}

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
  const user = await getVerifiedFleetUser(request);

  const existing = db.prepare("SELECT * FROM driver_vehicle_checks WHERE id = ?").get(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const beforeSnap = dvcAudit(existing as Record<string, unknown>);

  const allowedFields: Record<string, string> = {
    tripId: "trip_id",
    driverName: "driver_name",
    mileageKm: "mileage_km",
    checkDate: "check_date",
    routeFrom: "route_from",
    routeTo: "route_to",
    direction: "direction",
    remarks: "remarks",
    travelPhoneNumber: "travel_phone_number",
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

  // Passenger manifest is a normalized JSON array, handled separately from
  // the allowedFields map (which covers scalar columns). Edits land in the
  // same canonical shape as POST so the HR deployments API can join on
  // employee_id without surprises. Empty arrays are allowed (a returning
  // check legitimately has no passengers), but entries without an
  // employee_id are silently dropped by the normalizer.
  if (body.passengerManifest !== undefined) {
    const manifest = normalizePassengerManifest(body.passengerManifest);
    fields.push("passenger_manifest = ?");
    values.push(JSON.stringify(manifest));
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  fields.push("updated_at = ?");
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE driver_vehicle_checks SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  const oldPass = (existing as Record<string, unknown>).overall_pass;
  if (body.overallPass !== undefined && body.overallPass !== oldPass) {
    db.prepare(
      "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("driver_vehicle_check", id, oldPass ? "pass" : "fail", body.overallPass ? "pass" : "fail", body.changedBy || "", now);
  }

  const updated = db.prepare(`
    SELECT dvc.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM driver_vehicle_checks dvc
    JOIN vehicles v ON dvc.vehicle_id = v.id
    WHERE dvc.id = ?
  `).get(id) as Record<string, unknown>;

  recordMutation(db, {
    entityType: "driver_vehicle_check",
    entityId: id,
    organizationId: String((existing as Record<string, unknown>).organization_id ?? ""),
    action: "update",
    actor: auditActorFrom(user, { name: String(body.changedBy || "") }),
    before: beforeSnap,
    after: dvcAudit(updated),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const user = await getVerifiedFleetUser(request);

  const row = db
    .prepare("SELECT * FROM driver_vehicle_checks WHERE id = ? AND organization_id = ?")
    .get(id, org) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  recordMutation(db, {
    entityType: "driver_vehicle_check",
    entityId: id,
    organizationId: org,
    action: "delete",
    actor: auditActorFrom(user, {}),
    before: dvcAudit(row),
  });

  const result = db.prepare(
    "DELETE FROM driver_vehicle_checks WHERE id = ? AND organization_id = ?"
  ).run(id, org);

  if (result.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
