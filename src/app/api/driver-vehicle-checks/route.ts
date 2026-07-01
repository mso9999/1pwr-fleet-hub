import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";
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

interface ManifestPassenger {
  employee_id: string;
  name: string;
  department?: string | null;
  country?: string | null;
}

/**
 * Normalize the incoming passenger manifest into a stable JSON shape.
 * The canonical reference is `employee_id` (from the HR directory); a name
 * snapshot is kept for display/audit history. Free-text entries without an
 * employee_id are rejected so the manifest can never contain ambiguous names.
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

export function GET(request: NextRequest): NextResponse {
  try {
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
  } catch (err) {
    console.error("[driver-vehicle-checks] GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.vehicleId || typeof body.vehicleId !== "string") {
      return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
    }

    const user = await getVerifiedFleetUser(request);
    const db = getDb();

    // Defensive: legacy production DBs may predate trip_id. getDb()'s ensurePhase1Schema should handle this,
    // but we re-assert here so a single stale deploy can't block check submission.
    const dvcCols = db
      .prepare("PRAGMA table_info(driver_vehicle_checks)")
      .all() as Array<{ name: string }>;
    if (!dvcCols.some((c) => c.name === "trip_id")) {
      db.exec("ALTER TABLE driver_vehicle_checks ADD COLUMN trip_id TEXT DEFAULT NULL");
      db.exec("CREATE INDEX IF NOT EXISTS idx_dvc_trip ON driver_vehicle_checks(trip_id)");
    }
    if (!dvcCols.some((c) => c.name === "passenger_manifest")) {
      db.exec("ALTER TABLE driver_vehicle_checks ADD COLUMN passenger_manifest TEXT NOT NULL DEFAULT '[]'");
    }

    const direction = String(body.direction || "departing").toLowerCase();

    // Policy gate (2026-07-01): vehicles must not be deployed without the
    // mission getting logged and approved. A departing DVC is the moment the
    // driver documents who is on board and anchors HR's field-deployment
    // clock, so it must reference an approved-mission trip. Returning checks
    // are not deployments and stay ungated.
    //
    // We require an explicit tripId (no auto-link) and validate:
    //   - the trip exists
    //   - the trip's vehicle matches this DVC's vehicle
    //   - the trip has a linked mission whose approval_status = 'approved'
    //   - the trip has not yet departed (departed_at IS NULL)
    //   - the trip has not been checked in (checkin_at IS NULL)
    // If any check fails we return 400 with a clear reason so the driver /
    // dispatch can fix the upstream step (create+approve the mission, or
    // create+link the trip) before re-submitting.
    if (direction === "departing") {
      const tripId = String(body.tripId || "").trim();
      if (!tripId) {
        return NextResponse.json(
          {
            error:
              "An approved mission / trip is required for a departing check. Pick one from the list, or ask dispatch to log and approve a mission for this vehicle first.",
            reason: "missing_trip",
          },
          { status: 400 }
        );
      }
      const trip = db
        .prepare(
          `SELECT t.id, t.vehicle_id, t.mission_id, t.departed_at, t.checkin_at,
                  m.approval_status  AS mission_approval_status,
                  m.lifecycle_status AS mission_lifecycle_status
             FROM trips t
             LEFT JOIN missions m ON t.mission_id = m.id
            WHERE t.id = ?`
        )
        .get(tripId) as
        | {
            id: string;
            vehicle_id: string;
            mission_id: string | null;
            departed_at: string | null;
            checkin_at: string | null;
            mission_approval_status: string | null;
            mission_lifecycle_status: string | null;
          }
        | undefined;
      if (!trip) {
        return NextResponse.json(
          { error: "Selected trip no longer exists. Refresh and pick again.", reason: "trip_not_found" },
          { status: 400 }
        );
      }
      if (String(trip.vehicle_id || "") !== String(body.vehicleId)) {
        return NextResponse.json(
          { error: "Selected trip is for a different vehicle. Pick a trip matching this vehicle.", reason: "vehicle_mismatch" },
          { status: 400 }
        );
      }
      if (!trip.mission_id) {
        return NextResponse.json(
          { error: "Selected trip is not linked to a mission. Dispatch must attach an approved mission before departure.", reason: "missing_mission" },
          { status: 400 }
        );
      }
      if (String(trip.mission_approval_status || "").toLowerCase() !== "approved") {
        return NextResponse.json(
          {
            error: `Mission is ${trip.mission_approval_status || "pending"} — not approved. A manager must approve the mission before this vehicle can deploy.`,
            reason: "mission_not_approved",
          },
          { status: 400 }
        );
      }
      if (String(trip.mission_lifecycle_status || "active").toLowerCase() !== "active") {
        return NextResponse.json(
          { error: `Mission lifecycle is ${trip.mission_lifecycle_status}. Only active missions can deploy.`, reason: "mission_not_active" },
          { status: 400 }
        );
      }
      if (trip.departed_at) {
        return NextResponse.json(
          { error: "Selected trip has already departed. Pick the next pending trip for this vehicle.", reason: "trip_already_departed" },
          { status: 400 }
        );
      }
      if (trip.checkin_at) {
        return NextResponse.json(
          { error: "Selected trip has already been checked in. Pick the next pending trip for this vehicle.", reason: "trip_already_checked_in" },
          { status: 400 }
        );
      }
    }

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
    const exceptionItems = (body.exceptionItems as unknown[]) || [];
    const hasExceptions = hasFail && exceptionItems.length > 0;
    const overallPass = !hasFail || (hasExceptions && body.exceptionApproved === true);

    const failureDescriptions = body.failureDescriptions || {};

    const passengerManifest = normalizePassengerManifest(body.passengerManifest);

    const cols = [
      "id", "organization_id", "vehicle_id", "trip_id", "driver_id", "driver_name",
      "mileage_km", "check_date", "route_from", "route_to", "direction",
      ...STATUS_CHECK_FIELDS,
      "failure_descriptions", "remarks", "travel_phone_number",
      ...EQUIP_FIELDS,
      "has_exceptions", "exception_items", "exception_approved",
      "approved_by", "approved_at", "approval_method",
      "overall_pass", "passenger_manifest", "created_at", "updated_at",
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
      typeof body.travelPhoneNumber === "string" ? body.travelPhoneNumber.trim() : "",
      ...EQUIP_FIELDS.map((f) => equipValues[f]),
      hasExceptions ? 1 : 0,
      JSON.stringify(exceptionItems),
      body.exceptionApproved ? 1 : 0,
      body.approvedBy || "",
      body.approvedAt || null,
      body.approvalMethod || "",
      overallPass ? 1 : 0,
      JSON.stringify(passengerManifest),
      now,
      now,
    ];

    const insertCheckAndMaybeWo = db.transaction(() => {
      db.prepare(`INSERT INTO driver_vehicle_checks (${cols.join(", ")}) VALUES (${placeholders})`).run(...vals);

      // Note: no auto-link to a trip. As of 2026-07-01 the policy is that
      // departing DVCs must reference an explicitly-selected, approved-mission
      // trip (validated above). Returning DVCs may carry a tripId if the
      // caller supplies one (e.g. the returning check links back to the same
      // trip), but we never silently bind a DVC to a trip the driver didn't
      // pick — that was the failure mode that left HR blind to the LS SEH
      // deployment on 13/06.

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
    });

    insertCheckAndMaybeWo();

    const row = db.prepare(`
    SELECT dvc.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM driver_vehicle_checks dvc
    JOIN vehicles v ON dvc.vehicle_id = v.id
    WHERE dvc.id = ?
  `).get(id);

    recordMutation(db, {
      entityType: "driver_vehicle_check",
      entityId: id,
      organizationId: String(body.organizationId || "1pwr_lesotho"),
      action: "create",
      actor: auditActorFrom(user, {
        id: String(body.driverId || ""),
        name: String(body.driverName || ""),
      }),
      after: {
        vehicleId: body.vehicleId,
        tripId: body.tripId || null,
        overallPass,
        direction: body.direction || "departing",
        checkDate: body.checkDate || today,
      },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[driver-vehicle-checks] POST:", err);
    return NextResponse.json(
      {
        error:
          message.includes("FOREIGN KEY") || message.includes("foreign key")
            ? "Invalid vehicle or data reference. Refresh the page and pick the vehicle again."
            : message.includes("SQLITE") || message.includes("no such column")
              ? `Database error while saving the check: ${message}`
              : message,
      },
      { status: 500 }
    );
  }
}
