import type Database from "better-sqlite3";
import { parseDepartureSelectionId } from "@/lib/eligible-for-departure";
import { isUnallocatedVehicleId } from "@/lib/mission-checkout";

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
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v ?? "").trim();

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
  const vehicle = vehicleId
    ? (db.prepare("SELECT id, code FROM vehicles WHERE id = ? AND organization_id = ?").get(vehicleId, org) as
        | Row
        | undefined)
    : undefined;

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
  const push = (v: unknown): void => {
    const n = Number(v);
    if (v != null && v !== "" && Number.isFinite(n) && n > 0) odos.push(Math.round(n));
  };
  if (vehicle) {
    const last = db
      .prepare(
        `SELECT mileage_km FROM driver_vehicle_checks
          WHERE vehicle_id = ? AND organization_id = ? AND mileage_km IS NOT NULL
          ORDER BY created_at DESC LIMIT 1`
      )
      .get(str(vehicle.id), org) as Row | undefined;
    push(last?.mileage_km);
  }
  push(trip?.odo_end);
  push(trip?.odo_start);

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
  };
}
