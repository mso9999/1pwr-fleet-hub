import type { Database } from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import {
  normalizeRouteStops,
  normalizeTripShape,
  type RouteStopNormalized,
} from "@/lib/trip-route";
import type { MissionFuelSnapshot } from "@/lib/fuel-estimate";
import { emptyMissionFuelSnapshot } from "@/lib/fuel-estimate";
import { defaultFuelCurrencyForOrg } from "@/lib/fuel-calculator";

export function insertPlannedMission(
  db: Database,
  input: {
    organizationId: string;
    title: string;
    destination: string;
    departureLocation?: string;
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
    stops?: Array<{
      location: string;
      loadOut?: string;
      loadIn?: string;
      notes?: string;
      lat?: number | null;
      lng?: number | null;
    }>;
    requiredVehicleClass?: string;
    rrStatus?: string;
    hrRequestId?: string;
    hrRequestStatus?: string;
    hrSyncSource?: string;
    hrSourceUpdatedAt?: string;
    /** Transport mode: 'company_vehicle' (default), 'public_transport'
     *  (team on public transport), 'third_party' (hired third-party transport),
     *  or 'personal_vehicle' (employee's own vehicle). Non-company modes have
     *  no reserved vehicle and use a per-org sentinel at trip checkout. */
    transportMode?: "company_vehicle" | "public_transport" | "third_party" | "personal_vehicle";
    /** Required when transportMode != 'company_vehicle'. Free-text justification
     *  (e.g. "no vehicles available"). Enforced at the API layer. */
    publicTransportJustification?: string;
    initialApprovalStatus?: "draft" | "pending";
    assetsBeingMoved?: boolean;
    linkedManifestIds?: string[];
    /** Excel fuel budget snapshot; omitted / empty for public_transport. */
    fuel?: MissionFuelSnapshot | null;
  }
): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  const profile = String(input.missionProfile || "local").toLowerCase() === "field" ? "field" : "local";
  const tripShape = normalizeTripShape(input.tripShape);
  const stops = normalizeRouteStops(input.stops);
  type TransportMode = "company_vehicle" | "public_transport" | "third_party" | "personal_vehicle";
  const tmRaw = String(input.transportMode || "company_vehicle").toLowerCase();
  const transportMode: TransportMode =
    tmRaw === "public_transport" || tmRaw === "third_party" || tmRaw === "personal_vehicle"
      ? (tmRaw as TransportMode)
      : "company_vehicle";
  const publicTransportJustification = String(input.publicTransportJustification || "").trim().slice(0, 1000);
  // Non-company-vehicle missions have no company vehicle, so required_vehicle_class
  // is meaningless and would otherwise block trip-readiness gates. Force empty.
  const reqClass = transportMode === "company_vehicle"
    ? String(input.requiredVehicleClass || "").trim()
    : "";
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
          // For non-company-vehicle missions, every passenger is by definition
          // on the chosen transport — there's no company vehicle to straggle
          // from. Coerce travel_mode to 'on_vehicle' so the straggler
          // deployment detector doesn't fire.
          const rawMode = String(p.travel_mode ?? "on_vehicle").toLowerCase();
          const travelMode =
            transportMode !== "company_vehicle"
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

  const tx = db.transaction((routeStops: Array<RouteStopNormalized & { lat?: number | null; lng?: number | null }>) => {
    const fuel =
      transportMode !== "company_vehicle"
        ? emptyMissionFuelSnapshot(defaultFuelCurrencyForOrg(input.organizationId))
        : input.fuel || emptyMissionFuelSnapshot(defaultFuelCurrencyForOrg(input.organizationId));

    db.prepare(`
      INSERT INTO missions (
        id, organization_id, title, destination, departure_location, departure_date, return_date,
        mission_type, passengers, crew_size, personnel_manifest, loadout_summary, notes, status, approval_status,
        mission_profile, trip_shape, required_vehicle_class, rr_status,
        hr_request_id, hr_request_status, hr_sync_source, hr_source_updated_at,
        transport_mode, public_transport_justification,
        assets_being_moved, linked_manifest_ids,
        fuel_road_km, fuel_estimated_km, fuel_total_km,
        fuel_economy_km_per_l, fuel_economy_l_per_100km,
        fuel_pump_price, fuel_currency, fuel_safety_factor,
        fuel_liters, fuel_cost, fuel_budget, fuel_legs_json, fuel_disposition,
        created_by_id, created_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.organizationId,
      input.title,
      input.destination,
      String(input.departureLocation || "HQ").trim() || "HQ",
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
      input.assetsBeingMoved ? 1 : 0,
      JSON.stringify(Array.isArray(input.linkedManifestIds) ? input.linkedManifestIds : []),
      fuel.fuel_road_km,
      fuel.fuel_estimated_km,
      fuel.fuel_total_km,
      fuel.fuel_economy_km_per_l,
      fuel.fuel_economy_l_per_100km,
      fuel.fuel_pump_price,
      fuel.fuel_currency,
      fuel.fuel_safety_factor,
      fuel.fuel_liters,
      fuel.fuel_cost,
      fuel.fuel_budget,
      fuel.fuel_legs_json,
      fuel.fuel_disposition,
      input.createdById,
      input.createdByName,
      now,
      now
    );

    if (routeStops.length > 0) {
      const insStop = db.prepare(`
        INSERT INTO mission_stops (
          id, mission_id, stop_order, location, load_out, load_in, notes, lat, lng, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < routeStops.length; i += 1) {
        const s = routeStops[i];
        const lat =
          typeof s.lat === "number" && Number.isFinite(s.lat) ? s.lat : null;
        const lng =
          typeof s.lng === "number" && Number.isFinite(s.lng) ? s.lng : null;
        insStop.run(
          uuidv4(),
          id,
          i + 1,
          s.location,
          s.loadOut,
          s.loadIn,
          s.notes,
          lat,
          lng,
          now,
          now
        );
      }
    }
  });
  // Preserve optional lat/lng on stops beyond RouteStopNormalized.
  const stopsWithCoords = (input.stops || []).map((s, i) => ({
    ...(stops[i] || normalizeRouteStops([s])[0]),
    lat: s.lat ?? null,
    lng: s.lng ?? null,
  }));
  tx(stopsWithCoords.length > 0 ? stopsWithCoords : stops.map((s) => ({ ...s, lat: null, lng: null })));
  return id;
}
