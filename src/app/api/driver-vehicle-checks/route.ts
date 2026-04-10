import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

const STATUS_CHECK_FIELDS = [
  "electrics_front_lights", "electrics_rear_lights", "electrics_indicators",
  "electrics_brake_lights", "electrics_horn", "electrics_windows",
  "electrics_central_locking", "electrics_wipers", "electrics_dashboard_gauges",
  "electrics_ac_heating", "fluids_engine_oil", "fluids_engine_coolant",
  "fluids_power_steering", "fluids_transmission", "fluids_fuel",
  "drive_steering", "drive_brakes", "drive_tire_pressure",
  "visual_spare_wheel_condition", "visual_doors",
] as const;

const EQUIP_FIELDS = [
  "equip_jack", "equip_spare_wheel", "equip_triangle", "equip_jump_leads",
  "equip_fire_extinguisher", "equip_phone_charger", "equip_first_aid_kit",
  "equip_flashlight", "equip_tool_wheel_spanners", "equip_tool_multimeter",
  "equip_tool_cable_cutters", "equip_tool_pliers", "equip_tool_tow_straps",
  "equip_tool_inverter",
] as const;

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const sp = request.nextUrl.searchParams;
  const org = sp.get("org") || "1pwr_lesotho";

  let query = `
    SELECT dvc.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM driver_vehicle_checks dvc
    JOIN vehicles v ON dvc.vehicle_id = v.id
    WHERE dvc.organization_id = ?
  `;
  const params: unknown[] = [org];

  const vehicleId = sp.get("vehicleId");
  if (vehicleId) { query += " AND dvc.vehicle_id = ?"; params.push(vehicleId); }

  const direction = sp.get("direction");
  if (direction) { query += " AND dvc.direction = ?"; params.push(direction); }

  const from = sp.get("from");
  if (from) { query += " AND dvc.check_date >= ?"; params.push(from); }

  const to = sp.get("to");
  if (to) { query += " AND dvc.check_date <= ?"; params.push(to); }

  const passOnly = sp.get("passOnly");
  if (passOnly === "true") { query += " AND dvc.overall_pass = 1"; }

  const limit = parseInt(sp.get("limit") || "100", 10);
  const offset = parseInt(sp.get("offset") || "0", 10);
  query += " ORDER BY dvc.created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const rows = db.prepare(query).all(...params);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const body = await request.json();
  const id = uuidv4();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const statusValues: Record<string, string> = {};
  for (const dbCol of STATUS_CHECK_FIELDS) {
    const camelKey = dbCol.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    statusValues[dbCol] = body[camelKey] === "fail" ? "fail" : "pass";
  }

  const equipValues: Record<string, number> = {};
  for (const dbCol of EQUIP_FIELDS) {
    const camelKey = dbCol.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    equipValues[dbCol] = body[camelKey] === 0 || body[camelKey] === false ? 0 : 1;
  }

  const hasFail = Object.values(statusValues).some((v) => v === "fail");
  const exceptionItems = body.exceptionItems || [];
  const hasExceptions = hasFail && exceptionItems.length > 0;
  const overallPass = !hasFail || (hasExceptions && body.exceptionApproved === true);

  const failureDescriptions = body.failureDescriptions || {};

  const cols = [
    "id", "organization_id", "vehicle_id", "trip_id", "driver_id", "driver_name",
    "mileage_km", "check_date", "route_from", "route_to", "direction",
    ...STATUS_CHECK_FIELDS,
    "failure_descriptions", "remarks",
    ...EQUIP_FIELDS,
    "has_exceptions", "exception_items", "exception_approved",
    "approved_by", "approved_at", "approval_method",
    "overall_pass", "created_at", "updated_at",
  ];

  const placeholders = cols.map(() => "?").join(", ");
  const vals = [
    id,
    body.organizationId || "1pwr_lesotho",
    body.vehicleId,
    body.tripId || null,
    body.driverId || "",
    body.driverName || "",
    body.mileageKm ?? null,
    body.checkDate || today,
    body.routeFrom || "",
    body.routeTo || "",
    body.direction || "departing",
    ...STATUS_CHECK_FIELDS.map((f) => statusValues[f]),
    JSON.stringify(failureDescriptions),
    body.remarks || "",
    ...EQUIP_FIELDS.map((f) => equipValues[f]),
    hasExceptions ? 1 : 0,
    JSON.stringify(exceptionItems),
    body.exceptionApproved ? 1 : 0,
    body.approvedBy || "",
    body.approvedAt || null,
    body.approvalMethod || "",
    overallPass ? 1 : 0,
    now,
    now,
  ];

  db.prepare(`INSERT INTO driver_vehicle_checks (${cols.join(", ")}) VALUES (${placeholders})`).run(...vals);

  if (hasFail) {
    const failItems = Object.entries(statusValues)
      .filter(([, v]) => v === "fail")
      .map(([k]) => k.replace(/_/g, " "));
    const failCount = failItems.length;

    if (failCount >= 3) {
      const woId = uuidv4();
      const failDesc = failItems.join(", ");
      db.prepare(`
        INSERT INTO work_orders (id, organization_id, vehicle_id, title, description, type, priority, status, downtime_start, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'inspection-flagged', 'high', 'reported', ?, ?, ?)
      `).run(
        woId,
        body.organizationId || "1pwr_lesotho",
        body.vehicleId,
        `Vehicle check failures (${failCount}): ${failDesc.substring(0, 80)}`,
        `Auto-created from driver vehicle check ${id}. Failed items: ${failDesc}`,
        now, now, now
      );
    }
  }

  const row = db.prepare(`
    SELECT dvc.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM driver_vehicle_checks dvc
    JOIN vehicles v ON dvc.vehicle_id = v.id
    WHERE dvc.id = ?
  `).get(id);

  return NextResponse.json(row, { status: 201 });
}
