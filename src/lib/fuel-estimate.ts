/**
 * Resolve waypoints + compute Excel fuel budget for missions / standalone calculator.
 */

import type Database from "better-sqlite3";
import {
  calculateFuelBudget,
  DEFAULT_FUEL_SAFETY_FACTOR,
  defaultFuelCurrencyForOrg,
  lPer100ToKmPerL,
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
    if (sug) {
      lPer100 = sug.lPer100km;
      source = "lookup";
    }
  }
  if (lPer100 == null || !(lPer100 > 0)) return null;
  return { kmPerLitre: lPer100ToKmPerL(lPer100), lPer100km: lPer100, source };
}

export type FuelEstimateRequest = {
  organizationId: string;
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
    const fromVeh = resolveVehicleEconomyKmPerL(db, input.vehicleId);
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
