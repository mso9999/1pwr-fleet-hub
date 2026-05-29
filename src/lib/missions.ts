import type { Database } from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import {
  normalizeRouteStops,
  normalizeTripShape,
  type RouteStopNormalized,
} from "@/lib/trip-route";

export function insertPlannedMission(
  db: Database,
  input: {
    organizationId: string;
    title: string;
    destination: string;
    departureDate: string;
    returnDate: string;
    missionType: string;
    passengers: string;
    loadoutSummary: string;
    notes: string;
    createdById: string;
    createdByName: string;
    missionProfile?: string;
    tripShape?: string;
    stops?: Array<{ location: string; loadOut?: string; loadIn?: string; notes?: string }>;
    requiredVehicleClass?: string;
    rrStatus?: string;
    hrRequestId?: string;
    hrRequestStatus?: string;
    hrSyncSource?: string;
    hrSourceUpdatedAt?: string;
  }
): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  const profile = String(input.missionProfile || "local").toLowerCase() === "field" ? "field" : "local";
  const tripShape = normalizeTripShape(input.tripShape);
  const stops = normalizeRouteStops(input.stops);
  const reqClass = String(input.requiredVehicleClass || "").trim();
  const rr = String(input.rrStatus || "na").toLowerCase();
  const rrNorm = rr === "pending" || rr === "approved" ? rr : "na";

  const tx = db.transaction((routeStops: RouteStopNormalized[]) => {
    db.prepare(`
      INSERT INTO missions (
        id, organization_id, title, destination, departure_date, return_date,
        mission_type, passengers, loadout_summary, notes, status, approval_status,
        mission_profile, trip_shape, required_vehicle_class, rr_status,
        hr_request_id, hr_request_status, hr_sync_source, hr_source_updated_at,
        created_by_id, created_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.organizationId,
      input.title,
      input.destination,
      input.departureDate,
      input.returnDate,
      input.missionType || "other",
      input.passengers,
      input.loadoutSummary,
      input.notes,
      profile,
      tripShape,
      reqClass,
      rrNorm,
      input.hrRequestId || null,
      input.hrRequestStatus || null,
      input.hrSyncSource || null,
      input.hrSourceUpdatedAt || null,
      input.createdById,
      input.createdByName,
      now,
      now
    );

    if (routeStops.length > 0) {
      const insStop = db.prepare(`
        INSERT INTO mission_stops (
          id, mission_id, stop_order, location, load_out, load_in, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < routeStops.length; i += 1) {
        const s = routeStops[i];
        insStop.run(
          uuidv4(),
          id,
          i + 1,
          s.location,
          s.loadOut,
          s.loadIn,
          s.notes,
          now,
          now
        );
      }
    }
  });
  tx(stops);
  return id;
}
