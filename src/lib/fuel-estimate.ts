/**
 * Resolve waypoints + compute Excel fuel budget for missions / standalone calculator.
 */

import type Database from "better-sqlite3";
import {
  calculateFuelBudget,
  DEFAULT_FUEL_SAFETY_FACTOR,
  defaultFuelCurrencyForOrg,
  lPer100ToKmPerL,
  normalizeFuelDisposition,
  type FuelBudgetResult,
  type FuelDisposition,
} from "@/lib/fuel-calculator";
import {
  buildTripWaypoints,
  multiLegDrivingDistance,
  type MultiLegRouteResult,
  type RouteLegResult,
} from "@/lib/route-distance";
import type { LatLng } from "@/lib/routing-osrm";
import { getRouteOrigin, getSiteCoordsByCode } from "@/lib/vehicle-request-fuel";
import { suggestFuelLPer100km } from "@/lib/vehicle-fuel-lookup";

export type FuelWaypointInput = {
  /** Site code, free-text place, or label. */
  label?: string;
  siteCode?: string;
  lat?: number | null;
  lng?: number | null;
};

export type OrgFuelDefaults = {
  organizationId: string;
  currency: string;
  safetyFactor: number;
  defaultPumpPrice: number | null;
};

export function getOrgFuelDefaults(db: Database.Database, organizationId: string): OrgFuelDefaults {
  const row = db
    .prepare(
      `SELECT currency, fuel_safety_factor, fuel_default_pump_price
       FROM organizations WHERE id = ?`
    )
    .get(organizationId) as
    | {
        currency: string;
        fuel_safety_factor: number | null;
        fuel_default_pump_price: number | null;
      }
    | undefined;

  const currency =
    (row?.currency && String(row.currency).trim()) || defaultFuelCurrencyForOrg(organizationId);
  const factorRaw = row?.fuel_safety_factor;
  const safetyFactor =
    typeof factorRaw === "number" && Number.isFinite(factorRaw) && factorRaw > 0
      ? factorRaw
      : DEFAULT_FUEL_SAFETY_FACTOR;
  const pump = row?.fuel_default_pump_price;
  const defaultPumpPrice =
    typeof pump === "number" && Number.isFinite(pump) && pump > 0 ? pump : null;

  return { organizationId, currency, safetyFactor, defaultPumpPrice };
}

export function resolveWaypointCoords(
  db: Database.Database,
  organizationId: string,
  wp: FuelWaypointInput,
  fallbackOrigin?: LatLng | null
): LatLng | null {
  if (
    typeof wp.lat === "number" &&
    typeof wp.lng === "number" &&
    Number.isFinite(wp.lat) &&
    Number.isFinite(wp.lng)
  ) {
    return { lat: wp.lat, lng: wp.lng };
  }
  const code = String(wp.siteCode || wp.label || "").trim();
  if (code) {
    const fromSite = getSiteCoordsByCode(db, organizationId, code);
    if (fromSite) return fromSite;
  }
  if (fallbackOrigin && (!code || code.toUpperCase() === "HQ")) {
    return fallbackOrigin;
  }
  return null;
}

export function resolveVehicleEconomyKmPerL(
  db: Database.Database,
  vehicleId: string | null | undefined
): { kmPerLitre: number; lPer100km: number; source: string } | null {
  if (!vehicleId) return null;
  const veh = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId) as
    | Record<string, unknown>
    | undefined;
  if (!veh) return null;
  let lPer100: number | null = null;
  let source = "";
  const manual = veh.fuel_consumption_l_per_100km as number | null | undefined;
  if (typeof manual === "number" && Number.isFinite(manual) && manual > 0) {
    lPer100 = manual;
    source = "vehicle";
  } else {
    const sug = suggestFuelLPer100km(
      String(veh.make ?? ""),
      String(veh.model ?? ""),
      typeof veh.year === "number" ? veh.year : null
    );
    const cls = String(veh.asset_class ?? "").trim().toLowerCase();
    if (sug && cls && cls !== "4wd" && isGenericLookup(sug.note)) {
      const classFigure = CLASS_FALLBACK_L_PER_100[cls];
      if (classFigure) {
        lPer100 = classFigure;
        source = "class_average";
      }
    } else if (sug) {
      lPer100 = sug.lPer100km;
      source = "lookup";
    }
  }
  if (lPer100 == null || !(lPer100 > 0)) return null;
  return { kmPerLitre: lPer100ToKmPerL(lPer100), lPer100km: lPer100, source };
}

/** The lookup's unmatched-make/model row is a light-4WD figure — wrong for trucks/tractors. */
function isGenericLookup(note: string | undefined): boolean {
  return /^fallback when make\/model not matched/i.test(String(note || ""));
}

/** Used only when no org vehicle of the class yields an economy figure. */
const CLASS_FALLBACK_L_PER_100: Record<string, number> = {
  "4wd": 12,
  "cargo-truck": 30,
  tractor: 20,
};

/**
 * Typical economy for a required vehicle class, before a specific vehicle is reserved:
 * mean of per-vehicle economy (manual figure or make/model lookup) across the org's
 * real vehicles of that class, else a static class figure.
 */
export function resolveClassEconomyKmPerL(
  db: Database.Database,
  organizationId: string,
  vehicleClass: string | null | undefined
): { kmPerLitre: number; lPer100km: number; source: string } | null {
  const cls = String(vehicleClass || "").trim().toLowerCase();
  if (!cls) return null;
  const rows = db
    .prepare(
      `SELECT make, model, year, fuel_consumption_l_per_100km
       FROM vehicles
       WHERE organization_id = ? AND lower(asset_class) = ? AND COALESCE(is_synthetic, 0) = 0`
    )
    .all(organizationId, cls) as Array<{
    make: string | null;
    model: string | null;
    year: number | null;
    fuel_consumption_l_per_100km: number | null;
  }>;
  const figures: number[] = [];
  for (const r of rows) {
    const manual = r.fuel_consumption_l_per_100km;
    if (typeof manual === "number" && Number.isFinite(manual) && manual > 0) {
      figures.push(manual);
      continue;
    }
    if (!String(r.make || "").trim()) continue;
    const sug = suggestFuelLPer100km(String(r.make), String(r.model || ""), r.year);
    if (!sug || !(sug.lPer100km > 0)) continue;
    if (cls !== "4wd" && isGenericLookup(sug.note)) continue;
    figures.push(sug.lPer100km);
  }
  let lPer100: number | null = null;
  if (figures.length > 0) {
    lPer100 = Math.round((figures.reduce((s, n) => s + n, 0) / figures.length) * 10) / 10;
  } else if (CLASS_FALLBACK_L_PER_100[cls]) {
    lPer100 = CLASS_FALLBACK_L_PER_100[cls];
  }
  if (lPer100 == null || !(lPer100 > 0)) return null;
  return { kmPerLitre: lPer100ToKmPerL(lPer100), lPer100km: lPer100, source: "class_average" };
}

export type FuelEstimateRequest = {
  organizationId: string;
  /** Required vehicle class — economy fallback before a vehicle is chosen. */
  vehicleClass?: string | null;
  tripShape?: "one_way" | "round_trip" | "multi_stop";
  /** Ordered stops including start; if empty, origin + destination used. */
  waypoints?: FuelWaypointInput[];
  origin?: FuelWaypointInput;
  destination?: FuelWaypointInput;
  vehicleId?: string | null;
  /** Override economy (km/L). */
  kmPerLitre?: number | null;
  /** Override economy (L/100 km) — used if kmPerLitre not set. */
  lPer100km?: number | null;
  pumpPricePerLitre?: number | null;
  safetyFactor?: number | null;
  currency?: string | null;
};

export type FuelEstimateResponse = {
  ok: boolean;
  message?: string | null;
  unresolvedLabels?: string[];
  route: MultiLegRouteResult | null;
  legs: Array<RouteLegResult & { labelFrom?: string; labelTo?: string }>;
  budget: FuelBudgetResult | null;
  currency: string;
  economySource: string;
};

export async function estimateFuelBudget(
  db: Database.Database,
  input: FuelEstimateRequest
): Promise<FuelEstimateResponse> {
  const orgId = input.organizationId || "1pwr_lesotho";
  const defaults = getOrgFuelDefaults(db, orgId);
  const tripShape = input.tripShape || "one_way";
  const originFallback = getRouteOrigin(db, orgId);

  const rawWaypoints: FuelWaypointInput[] =
    Array.isArray(input.waypoints) && input.waypoints.length > 0
      ? input.waypoints
      : [
          input.origin || { siteCode: "HQ", label: "HQ" },
          ...(input.destination ? [input.destination] : []),
        ];

  const unresolved: string[] = [];
  const points: LatLng[] = [];
  const labels: string[] = [];
  for (const wp of rawWaypoints) {
    const label = String(wp.label || wp.siteCode || "").trim() || "(unnamed)";
    const coords = resolveWaypointCoords(db, orgId, wp, originFallback);
    if (!coords) {
      unresolved.push(label);
      continue;
    }
    points.push(coords);
    labels.push(label);
  }

  if (unresolved.length > 0) {
    return {
      ok: false,
      message: `Could not resolve coordinates for: ${unresolved.join(", ")}. Set a site GPS, drop a map pin, or pick a known site.`,
      unresolvedLabels: unresolved,
      route: null,
      legs: [],
      budget: null,
      currency: input.currency?.trim() || defaults.currency,
      economySource: "",
    };
  }

  if (points.length < 2) {
    return {
      ok: false,
      message: "Need at least a start and one destination.",
      route: null,
      legs: [],
      budget: null,
      currency: input.currency?.trim() || defaults.currency,
      economySource: "",
    };
  }

  const tripPoints = buildTripWaypoints(points, tripShape);
  // Labels for return leg
  const tripLabels =
    tripPoints.length > labels.length ? [...labels, labels[0]] : labels;

  const route = await multiLegDrivingDistance(tripPoints);
  const legs = route.legs.map((leg) => ({
    ...leg,
    labelFrom: tripLabels[leg.fromIndex],
    labelTo: tripLabels[leg.toIndex],
  }));

  let kmPerLitre = 0;
  let economySource = "manual";
  if (typeof input.kmPerLitre === "number" && input.kmPerLitre > 0) {
    kmPerLitre = input.kmPerLitre;
    economySource = "override_km_per_l";
  } else if (typeof input.lPer100km === "number" && input.lPer100km > 0) {
    kmPerLitre = lPer100ToKmPerL(input.lPer100km);
    economySource = "override_l_per_100";
  } else {
    const fromVeh =
      resolveVehicleEconomyKmPerL(db, input.vehicleId) ??
      resolveClassEconomyKmPerL(db, orgId, input.vehicleClass);
    if (fromVeh) {
      kmPerLitre = fromVeh.kmPerLitre;
      economySource = fromVeh.source;
    }
  }

  const pump =
    typeof input.pumpPricePerLitre === "number" && input.pumpPricePerLitre > 0
      ? input.pumpPricePerLitre
      : defaults.defaultPumpPrice ?? 0;
  const safetyFactor =
    typeof input.safetyFactor === "number" && input.safetyFactor > 0
      ? input.safetyFactor
      : defaults.safetyFactor;

  if (!(kmPerLitre > 0)) {
    return {
      ok: true,
      message: "Distance calculated. Enter economy (km/L or L/100 km) or pick a vehicle to get litres and budget.",
      route,
      legs,
      budget: null,
      currency: input.currency?.trim() || defaults.currency,
      economySource,
    };
  }

  if (!(pump > 0)) {
    const partial = calculateFuelBudget({
      distanceKm: route.totalKm,
      kmPerLitre,
      pumpPricePerLitre: 0,
      safetyFactor,
    });
    return {
      ok: true,
      message: "Enter pump price to get cost and budget.",
      route,
      legs,
      budget: partial,
      currency: input.currency?.trim() || defaults.currency,
      economySource,
    };
  }

  const budget = calculateFuelBudget({
    distanceKm: route.totalKm,
    kmPerLitre,
    pumpPricePerLitre: pump,
    safetyFactor,
  });

  return {
    ok: true,
    message: null,
    route,
    legs,
    budget,
    currency: input.currency?.trim() || defaults.currency,
    economySource,
  };
}

export type MissionFuelSnapshot = {
  fuel_road_km: number | null;
  fuel_estimated_km: number | null;
  fuel_total_km: number | null;
  fuel_economy_km_per_l: number | null;
  fuel_economy_l_per_100km: number | null;
  fuel_pump_price: number | null;
  fuel_currency: string;
  fuel_safety_factor: number | null;
  fuel_liters: number | null;
  fuel_cost: number | null;
  fuel_budget: number | null;
  fuel_legs_json: string;
  fuel_disposition: FuelDisposition;
};

export function emptyMissionFuelSnapshot(currency: string): MissionFuelSnapshot {
  return {
    fuel_road_km: null,
    fuel_estimated_km: null,
    fuel_total_km: null,
    fuel_economy_km_per_l: null,
    fuel_economy_l_per_100km: null,
    fuel_pump_price: null,
    fuel_currency: currency,
    fuel_safety_factor: null,
    fuel_liters: null,
    fuel_cost: null,
    fuel_budget: null,
    fuel_legs_json: "[]",
    fuel_disposition: "",
  };
}

export type MissionFuelInput = {
  organizationId: string;
  transportMode: string;
  tripShape: string;
  departureLocation: string;
  destination: string;
  stops: Array<{ location: string; lat?: number | null; lng?: number | null }>;
  vehicleClass?: string | null;
  vehicleId?: string | null;
  kmPerLitre?: number | null;
  lPer100km?: number | null;
  pumpPricePerLitre?: number | null;
  safetyFactor?: number | null;
  currency?: string | null;
  disposition: FuelDisposition;
  /** Client-side snapshot used only if the server cannot resolve the route. */
  clientSnapshot?: Partial<MissionFuelSnapshot> | null;
};

function positiveOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function buildMissionFuelSnapshot(
  db: Database.Database,
  input: MissionFuelInput
): Promise<MissionFuelSnapshot> {
  const currency = defaultFuelCurrencyForOrg(input.organizationId);
  if (input.transportMode !== "company_vehicle") {
    return emptyMissionFuelSnapshot(currency);
  }

  const waypoints: FuelWaypointInput[] = [
    {
      label: input.departureLocation || "HQ",
      siteCode: input.departureLocation || "HQ",
    },
    ...input.stops.map((s) => ({
      label: s.location,
      siteCode: s.location,
      lat: s.lat ?? null,
      lng: s.lng ?? null,
    })),
  ];
  const dest = input.destination.trim();
  if (dest) {
    const hasDest = waypoints
      .slice(1)
      .some((w) => String(w.label || "").toLowerCase() === dest.toLowerCase());
    if (!hasDest) {
      waypoints.push({ label: dest, siteCode: dest });
    }
  }

  const estimate = await estimateFuelBudget(db, {
    organizationId: input.organizationId,
    tripShape:
      input.tripShape === "round_trip" || input.tripShape === "multi_stop"
        ? input.tripShape
        : "one_way",
    waypoints,
    vehicleId: input.vehicleId || null,
    vehicleClass: input.vehicleClass || null,
    kmPerLitre: positiveOrNull(input.kmPerLitre),
    lPer100km: positiveOrNull(input.lPer100km),
    pumpPricePerLitre: positiveOrNull(input.pumpPricePerLitre),
    safetyFactor: positiveOrNull(input.safetyFactor),
    currency: input.currency ? String(input.currency) : null,
  });

  if (!estimate.ok || !estimate.route) {
    const client = input.clientSnapshot;
    if (client && typeof client === "object" && client.fuel_total_km != null) {
      return {
        ...emptyMissionFuelSnapshot(currency),
        ...client,
        fuel_disposition: input.disposition,
        fuel_legs_json:
          typeof client.fuel_legs_json === "string" ? client.fuel_legs_json : "[]",
      };
    }
    return { ...emptyMissionFuelSnapshot(currency), fuel_disposition: input.disposition };
  }

  return snapshotFromEstimate(estimate, input.disposition);
}

const MISSION_FUEL_COLUMNS: Array<keyof MissionFuelSnapshot> = [
  "fuel_road_km",
  "fuel_estimated_km",
  "fuel_total_km",
  "fuel_economy_km_per_l",
  "fuel_economy_l_per_100km",
  "fuel_pump_price",
  "fuel_currency",
  "fuel_safety_factor",
  "fuel_liters",
  "fuel_cost",
  "fuel_budget",
  "fuel_legs_json",
  "fuel_disposition",
];

export function writeMissionFuelSnapshot(
  db: Database.Database,
  missionId: string,
  snap: MissionFuelSnapshot
): void {
  const sets = MISSION_FUEL_COLUMNS.map((c) => `${c} = ?`).join(", ");
  db.prepare(`UPDATE missions SET ${sets} WHERE id = ?`).run(
    ...MISSION_FUEL_COLUMNS.map((c) => snap[c]),
    missionId
  );
}

/**
 * Re-run the mission's fuel budget from its stored route. Economy comes from the
 * assigned vehicle when there is one, else the required-class average; a pump price
 * or safety factor already stored on the mission is kept.
 */
export async function recomputeMissionFuel(
  db: Database.Database,
  missionId: string,
  opts: { write?: boolean } = {}
): Promise<MissionFuelSnapshot | null> {
  const m = db.prepare("SELECT * FROM missions WHERE id = ?").get(missionId) as
    | Record<string, unknown>
    | undefined;
  if (!m) return null;
  const stops = db
    .prepare(
      "SELECT location, lat, lng FROM mission_stops WHERE mission_id = ? ORDER BY stop_order"
    )
    .all(missionId) as Array<{ location: string; lat: number | null; lng: number | null }>;
  const vehicleId = String(m.assigned_vehicle_id || "").trim() || null;
  const snap = await buildMissionFuelSnapshot(db, {
    organizationId: String(m.organization_id || "1pwr_lesotho"),
    transportMode: String(m.transport_mode || "company_vehicle"),
    tripShape: String(m.trip_shape || "one_way"),
    departureLocation: String(m.departure_location || "HQ"),
    destination: String(m.destination || ""),
    stops,
    vehicleClass: String(m.required_vehicle_class || "") || null,
    vehicleId,
    kmPerLitre: vehicleId ? null : positiveOrNull(m.fuel_economy_km_per_l),
    pumpPricePerLitre: positiveOrNull(m.fuel_pump_price),
    safetyFactor: positiveOrNull(m.fuel_safety_factor),
    currency: String(m.fuel_currency || "") || null,
    disposition: normalizeFuelDisposition(m.fuel_disposition),
  });
  if (opts.write !== false) writeMissionFuelSnapshot(db, missionId, snap);
  return snap;
}

export function snapshotFromEstimate(
  estimate: FuelEstimateResponse,
  disposition: FuelDisposition
): MissionFuelSnapshot {
  const b = estimate.budget;
  return {
    fuel_road_km: estimate.route?.roadKm ?? null,
    fuel_estimated_km: estimate.route?.estimatedKm ?? null,
    fuel_total_km: estimate.route?.totalKm ?? null,
    fuel_economy_km_per_l: b?.kmPerLitre ?? null,
    fuel_economy_l_per_100km: b?.lPer100km ?? null,
    fuel_pump_price: b?.pumpPricePerLitre ?? null,
    fuel_currency: estimate.currency,
    fuel_safety_factor: b?.safetyFactor ?? null,
    fuel_liters: b?.litres ?? null,
    fuel_cost: b?.cost ?? null,
    fuel_budget: b?.budget ?? null,
    fuel_legs_json: JSON.stringify(
      estimate.legs.map((l) => ({
        from: l.labelFrom,
        to: l.labelTo,
        km: l.distanceKm,
        source: l.source,
      }))
    ),
    fuel_disposition: disposition,
  };
}
