import type Database from "better-sqlite3";
import { parseDepartureSelectionId } from "@/lib/eligible-for-departure";
import { isUnallocatedVehicleId } from "@/lib/mission-checkout";
import { vehicleVisibleToOrgSql } from "@/lib/vehicle-org-scope";

/** Pass/fail columns on driver_vehicle_checks. The form and POST body use the camelCase twin. */
export const DVC_STATUS_FIELDS = [
  "electrics_front_lights", "electrics_rear_lights", "electrics_indicators",
  "electrics_brake_lights", "electrics_horn", "electrics_windows",
  "electrics_central_locking", "electrics_wipers", "electrics_dashboard_gauges",
  "electrics_ac_heating", "fluids_engine_oil", "fluids_engine_coolant",
  "fluids_power_steering", "fluids_transmission", "fluids_fuel",
  "drive_steering", "drive_brakes", "drive_tire_pressure",
  "visual_spare_wheel_condition", "visual_doors",
] as const;

/** Equipment columns on driver_vehicle_checks (1 = present, 0 = missing). */
export const DVC_EQUIP_FIELDS = [
  "equip_jack", "equip_spare_wheel", "equip_triangle", "equip_jump_leads",
  "equip_fire_extinguisher", "equip_phone_charger", "equip_first_aid_kit",
  "equip_flashlight", "equip_tool_wheel_spanners", "equip_tool_multimeter",
  "equip_tool_cable_cutters", "equip_tool_pliers", "equip_tool_tow_straps",
  "equip_tool_inverter",
] as const;

export function dvcFieldToFormKey(column: string): string {
  return column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export interface PreviousDefect {
  kind: "status" | "equipment";
  /** camelCase form key, e.g. "driveBrakes" or "equipJack". */
  key: string;
  description: string;
}

export interface LastVehicleCheck {
  id: string;
  createdAt: string;
  checkDate: string;
  direction: string;
  driverName: string | null;
  mileageKm: number | null;
  /** The "Fuel" item under Fluid Levels; the form has no separate fuel-level reading. */
  fuel: "pass" | "fail";
  defects: PreviousDefect[];
  remarks: string;
}

export interface VehiclePrefillContext {
  vehicleId: string;
  vehicleCode: string;
  lastOdometerKm: number | null;
  lastOdometerSource: "check" | "trip" | "trip_reading" | null;
  lastOdometerAt: string | null;
  lastCheck: LastVehicleCheck | null;
}

export interface VehicleCheckContext {
  missionId: string | null;
  tripId: string | null;
  title: string;
  organizationId: string;
  vehicleId: string | null;
  vehicleCode: string | null;
  driverName: string | null;
  routeFrom: string;
  routeTo: string;
  departureDate: string | null;
  returnDate: string | null;
  /** True once the trip has been started (departed_at set) and not yet checked in. */
  departed: boolean;
  lastOdometerKm: number | null;
  /** Mission fuel budget estimate (litres), shown as info only. */
  plannedFuelLiters: number | null;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v ?? "").trim();

function positiveKm(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(String(raw || "{}"));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Turns a driver_vehicle_checks row into the prefill summary (failed items + missing equipment). */
export function summarizeVehicleCheck(row: Row): LastVehicleCheck {
  const descs = parseJsonObject(row.failure_descriptions);
  const defects: PreviousDefect[] = [];
  for (const col of DVC_STATUS_FIELDS) {
    if (str(row[col]) !== "fail") continue;
    const key = dvcFieldToFormKey(col);
    defects.push({ kind: "status", key, description: str(descs[key] ?? descs[col]) });
  }
  for (const col of DVC_EQUIP_FIELDS) {
    if (row[col] == null || Number(row[col]) !== 0) continue;
    defects.push({ kind: "equipment", key: dvcFieldToFormKey(col), description: "" });
  }
  return {
    id: str(row.id),
    createdAt: str(row.created_at),
    checkDate: str(row.check_date),
    direction: str(row.direction) || "departing",
    driverName: str(row.driver_name) || null,
    mileageKm: positiveKm(row.mileage_km),
    fuel: str(row.fluids_fuel) === "fail" ? "fail" : "pass",
    defects,
    remarks: str(row.remarks),
  };
}

/**
 * Most recent check for the vehicle, from any org: a seconded vehicle's defects travel with it.
 * Callers must check the vehicle is visible to the requesting org first.
 */
export function getLastVehicleCheck(db: Database.Database, vehicleId: string): LastVehicleCheck | null {
  const row = db
    .prepare("SELECT * FROM driver_vehicle_checks WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(vehicleId) as Row | undefined;
  return row ? summarizeVehicleCheck(row) : null;
}

/**
 * Latest known odometer for the vehicle: the highest of its last check, its most recent trip
 * (odo_end, else odo_start) and its most recent in-trip odometer reading.
 */
export function getLatestOdometer(
  db: Database.Database,
  vehicleId: string
): { km: number; source: "check" | "trip" | "trip_reading"; at: string | null } | null {
  const candidates: Array<{ km: number | null; source: "check" | "trip" | "trip_reading"; at: string | null }> = [];
  const check = db
    .prepare(
      `SELECT mileage_km, created_at FROM driver_vehicle_checks
        WHERE vehicle_id = ? AND mileage_km IS NOT NULL ORDER BY created_at DESC LIMIT 1`
    )
    .get(vehicleId) as Row | undefined;
  if (check) candidates.push({ km: positiveKm(check.mileage_km), source: "check", at: str(check.created_at) || null });
  const trip = db
    .prepare(
      `SELECT odo_start, odo_end, COALESCE(checkin_at, departed_at, checkout_at) AS at FROM trips
        WHERE vehicle_id = ? ORDER BY COALESCE(checkin_at, departed_at, checkout_at) DESC LIMIT 1`
    )
    .get(vehicleId) as Row | undefined;
  if (trip) {
    candidates.push({
      km: positiveKm(trip.odo_end) ?? positiveKm(trip.odo_start),
      source: "trip",
      at: str(trip.at) || null,
    });
  }
  const reading = db
    .prepare(
      `SELECT r.odo_km, r.recorded_at FROM trip_odometer_readings r JOIN trips t ON t.id = r.trip_id
        WHERE t.vehicle_id = ? ORDER BY r.recorded_at DESC LIMIT 1`
    )
    .get(vehicleId) as Row | undefined;
  if (reading) {
    candidates.push({ km: positiveKm(reading.odo_km), source: "trip_reading", at: str(reading.recorded_at) || null });
  }
  let best: { km: number; source: "check" | "trip" | "trip_reading"; at: string | null } | null = null;
  for (const c of candidates) {
    if (c.km != null && (!best || c.km > best.km)) best = { km: c.km, source: c.source, at: c.at };
  }
  return best;
}

function findVisibleVehicle(db: Database.Database, vehicleId: string, org: string): Row | undefined {
  const scope = vehicleVisibleToOrgSql(org);
  return db
    .prepare(`SELECT id, code FROM vehicles WHERE id = ? AND ${scope.sql}`)
    .get(vehicleId, ...scope.params) as Row | undefined;
}

/**
 * Prefill data that depends only on the selected vehicle. Returns null when the vehicle is
 * unknown, a placeholder, or not visible to the organization (owner or seconded borrower).
 */
export function getVehiclePrefillContext(
  db: Database.Database,
  input: { organizationId: string; vehicleId: string }
): VehiclePrefillContext | null {
  const org = str(input.organizationId);
  const vehicleId = str(input.vehicleId);
  if (!org || !vehicleId || isUnallocatedVehicleId(vehicleId)) return null;
  const vehicle = findVisibleVehicle(db, vehicleId, org);
  if (!vehicle) return null;
  const odo = getLatestOdometer(db, vehicleId);
  return {
    vehicleId,
    vehicleCode: str(vehicle.code),
    lastOdometerKm: odo?.km ?? null,
    lastOdometerSource: odo?.source ?? null,
    lastOdometerAt: odo?.at ?? null,
    lastCheck: getLastVehicleCheck(db, vehicleId),
  };
}

const DRIVER_OVERRIDE_RE = /Driver \(override, not yet EHS-approved\):[ \t]*([^\r\n]+)/;

export function parseDriverOverrideName(notes: string | null | undefined): string | null {
  const m = DRIVER_OVERRIDE_RE.exec(String(notes || ""));
  return m ? m[1].trim() || null : null;
}

function realVehicleId(...ids: unknown[]): string | null {
  for (const id of ids) {
    const s = str(id);
    if (s && !isUnallocatedVehicleId(s)) return s;
  }
  return null;
}

/**
 * Prefill data for the Driver Vehicle Check form. Returns null when the
 * mission/trip does not exist or belongs to another organization.
 * Accepts a missionId, a tripId, or a "mission:<id>" picker selection id.
 */
export function getVehicleCheckContext(
  db: Database.Database,
  input: { organizationId: string; missionId?: string | null; tripId?: string | null }
): VehicleCheckContext | null {
  const org = str(input.organizationId);
  let missionId = str(input.missionId);
  let tripId = str(input.tripId);
  if (tripId) {
    const parsed = parseDepartureSelectionId(tripId);
    tripId = parsed.tripId;
    if (!missionId) missionId = parsed.missionId;
  }
  if (!org || (!missionId && !tripId)) return null;

  let trip: Row | undefined;
  if (tripId) {
    trip = db.prepare("SELECT * FROM trips WHERE id = ? AND organization_id = ?").get(tripId, org) as Row | undefined;
    if (!trip) return null;
    if (!missionId) missionId = str(trip.mission_id);
  }

  let mission: Row | undefined;
  if (missionId) {
    mission = db.prepare("SELECT * FROM missions WHERE id = ? AND organization_id = ?").get(missionId, org) as
      | Row
      | undefined;
    if (!mission) return null;
    if (!trip) {
      trip = db
        .prepare(
          `SELECT * FROM trips
            WHERE organization_id = ? AND (id = ? OR mission_id = ?)
            ORDER BY (id = ?) DESC, (checkin_at IS NULL) DESC, checkout_at DESC LIMIT 1`
        )
        .get(org, str(mission.trip_id), missionId, str(mission.trip_id)) as Row | undefined;
    } else if (str(trip.mission_id) && str(trip.mission_id) !== missionId) {
      return null;
    }
  }

  const vehicleId = realVehicleId(mission?.assigned_vehicle_id, trip?.vehicle_id);
  const vehicle = vehicleId ? findVisibleVehicle(db, vehicleId, org) : undefined;

  let driverName: string | null = str(trip?.driver_name) || null;
  if (!driverName && missionId) {
    const requests = db
      .prepare(
        `SELECT notes, designated_operator_id FROM vehicle_requests
          WHERE mission_id = ? AND organization_id = ? ORDER BY created_at DESC`
      )
      .all(missionId, org) as Row[];
    for (const r of requests) {
      driverName = parseDriverOverrideName(str(r.notes));
      if (driverName) break;
    }
    if (!driverName) {
      for (const r of requests) {
        const opId = str(r.designated_operator_id);
        if (!opId) continue;
        const op = db
          .prepare("SELECT display_name FROM ehs_approved_drivers WHERE id = ? AND organization_id = ?")
          .get(opId, org) as Row | undefined;
        driverName = str(op?.display_name) || null;
        if (driverName) break;
      }
    }
  }

  const odos: number[] = [];
  for (const v of [vehicle ? getLatestOdometer(db, str(vehicle.id))?.km : null, trip?.odo_end, trip?.odo_start]) {
    const km = positiveKm(v);
    if (km != null) odos.push(km);
  }
  const plannedFuel = Number(mission?.fuel_liters);

  return {
    missionId: missionId || null,
    tripId: str(trip?.id) || null,
    title: str(mission?.title),
    organizationId: org,
    vehicleId: vehicle ? str(vehicle.id) : null,
    vehicleCode: vehicle ? str(vehicle.code) : null,
    driverName,
    routeFrom: str(trip?.departure_location) || str(mission?.departure_location),
    routeTo: str(trip?.destination) || str(mission?.destination),
    departureDate: str(mission?.departure_date) || str(trip?.planned_departure_date) || null,
    returnDate: str(mission?.return_date) || null,
    departed: !!str(trip?.departed_at) && !str(trip?.checkin_at),
    lastOdometerKm: odos.length ? Math.max(...odos) : null,
    plannedFuelLiters:
      mission?.fuel_liters != null && Number.isFinite(plannedFuel) && plannedFuel > 0 ? plannedFuel : null,
  };
}
