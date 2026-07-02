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
    crewSize?: number;
    personnelManifest?: Array<{
      employee_id: string;
      name: string;
      department?: string | null;
      country?: string | null;
      travel_mode?: string;
      notes?: string;
    }>;
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
    /** Scenario B: 'public_transport' = team travelling by public transport
     *  (no company vehicle). 'company_vehicle' (default) = standard flow. */
    transportMode?: "company_vehicle" | "public_transport";
    /** Required when transportMode = 'public_transport'. Free-text justification
     *  (e.g. "no vehicles available"). Enforced at the API layer. */
    publicTransportJustification?: string;
    initialApprovalStatus?: "draft" | "pending";
  }
): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  const profile = String(input.missionProfile || "local").toLowerCase() === "field" ? "field" : "local";
  const tripShape = normalizeTripShape(input.tripShape);
  const stops = normalizeRouteStops(input.stops);
  const transportMode: "company_vehicle" | "public_transport" =
    String(input.transportMode || "company_vehicle").toLowerCase() === "public_transport"
      ? "public_transport"
      : "company_vehicle";
  const publicTransportJustification = String(input.publicTransportJustification || "").trim().slice(0, 1000);
  // Public-transport missions have no company vehicle, so required_vehicle_class
  // is meaningless and would otherwise block trip-readiness gates. Force empty.
  const reqClass = transportMode === "public_transport"
    ? ""
    : String(input.requiredVehicleClass || "").trim();
  const rr = String(input.rrStatus || "na").toLowerCase();
  const rrNorm = rr === "pending" || rr === "approved" ? rr : "na";
  const initialApprovalStatus =
    input.initialApprovalStatus === "draft" ? "draft" : "pending";
  const crewSizeRaw = typeof input.crewSize === "number" ? input.crewSize : parseInt(String(input.crewSize ?? ""), 10);
  const crewSize = Number.isFinite(crewSizeRaw) && crewSizeRaw > 0 ? crewSizeRaw : 1;
  const manifestJson = (() => {
    try {
      const arr = Array.isArray(input.personnelManifest) ? input.personnelManifest : [];
      const clean = arr
        .filter((p) => p && typeof p === "object")
        .map((p) => {
          // For public-transport missions, every passenger is by definition
          // on public transport — there's no company vehicle to straggle
          // from. Coerce travel_mode to 'on_vehicle' so the straggler
          // deployment detector doesn't fire.
          const rawMode = String(p.travel_mode ?? "on_vehicle").toLowerCase();
          const travelMode =
            transportMode === "public_transport"
              ? "on_vehicle"
              : rawMode === "straggler_public_transport"
                ? "straggler_public_transport"
                : "on_vehicle";
          const notesRaw =
            typeof p.notes === "string" ? p.notes.trim().slice(0, 200) : "";
          return {
            employee_id: String(p.employee_id || ""),
            name: String(p.name || ""),
            department: p.department ?? null,
            country: p.country ?? null,
            travel_mode: travelMode,
            ...(notesRaw ? { notes: notesRaw } : {}),
          };
        });
      return JSON.stringify(clean);
    } catch {
      return "[]";
    }
  })();

  const tx = db.transaction((routeStops: RouteStopNormalized[]) => {
    db.prepare(`
      INSERT INTO missions (
        id, organization_id, title, destination, departure_date, return_date,
        mission_type, passengers, crew_size, personnel_manifest, loadout_summary, notes, status, approval_status,
        mission_profile, trip_shape, required_vehicle_class, rr_status,
        hr_request_id, hr_request_status, hr_sync_source, hr_source_updated_at,
        transport_mode, public_transport_justification,
        created_by_id, created_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.organizationId,
      input.title,
      input.destination,
      input.departureDate,
      input.returnDate,
      input.missionType || "other",
      input.passengers,
      crewSize,
      manifestJson,
      input.loadoutSummary,
      input.notes,
      initialApprovalStatus,
      profile,
      tripShape,
      reqClass,
      rrNorm,
      input.hrRequestId || null,
      input.hrRequestStatus || null,
      input.hrSyncSource || null,
      input.hrSourceUpdatedAt || null,
      transportMode,
      publicTransportJustification,
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
