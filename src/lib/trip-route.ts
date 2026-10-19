export const TRIP_SHAPES = {
  ONE_WAY: "one_way",
  ROUND_TRIP: "round_trip",
  MULTI_STOP: "multi_stop",
} as const;

export type TripShape = (typeof TRIP_SHAPES)[keyof typeof TRIP_SHAPES];

export interface RouteStopInput {
  location: string;
  loadOut?: string;
  loadIn?: string;
  notes?: string;
}

export interface RouteStopNormalized {
  location: string;
  loadOut: string;
  loadIn: string;
  notes: string;
}

export function normalizeTripShape(raw: unknown): TripShape {
  const s = String(raw || "").toLowerCase();
  if (s === TRIP_SHAPES.ROUND_TRIP) return TRIP_SHAPES.ROUND_TRIP;
  if (s === TRIP_SHAPES.MULTI_STOP) return TRIP_SHAPES.MULTI_STOP;
  return TRIP_SHAPES.ONE_WAY;
}

export function normalizeRouteStops(input: unknown): RouteStopNormalized[] {
  if (!Array.isArray(input)) return [];
  const out: RouteStopNormalized[] = [];
  for (const row of input as RouteStopInput[]) {
    const location = String(row?.location || "").trim();
    if (!location) continue;
    out.push({
      location,
      loadOut: String(row?.loadOut || "").trim(),
      loadIn: String(row?.loadIn || "").trim(),
      notes: String(row?.notes || "").trim(),
    });
  }
  return out;
}

export function validateRoutePlan(args: {
  tripShape: TripShape;
  destination: string;
  stops: RouteStopNormalized[];
}): string | null {
  const destination = args.destination.trim();
  if (!destination) return "Destination is required.";
  if (args.tripShape === TRIP_SHAPES.MULTI_STOP && args.stops.length < 2) {
    return "Multi-stop missions need at least 2 planned stops.";
  }
  if (args.tripShape === TRIP_SHAPES.ROUND_TRIP && args.stops.length < 1) {
    return "Round trips need at least one planned destination stop.";
  }
  return null;
}

export type RouteStopWithCoords = RouteStopNormalized & {
  lat?: number | null;
  lng?: number | null;
};

/**
 * Stops persisted on mission_stops — destination lives on missions.destination;
 * round trips store intermediate + return leg only (no duplicate dest row).
 */
export function buildStoredMissionStops(args: {
  tripShape: TripShape;
  originLabel: string;
  destination: string;
  waypoints: RouteStopWithCoords[];
  destinationLat?: number | null;
  destinationLng?: number | null;
  originLat?: number | null;
  originLng?: number | null;
}): RouteStopWithCoords[] {
  const origin = args.originLabel.trim() || "HQ";
  const destination = args.destination.trim();
  const returnStop: RouteStopWithCoords = {
    location: origin,
    loadOut: "",
    loadIn: "",
    notes: "Return leg",
    lat: args.originLat ?? null,
    lng: args.originLng ?? null,
  };
  const destStop: RouteStopWithCoords = {
    location: destination,
    loadOut: "",
    loadIn: "",
    notes: "",
    lat: args.destinationLat ?? null,
    lng: args.destinationLng ?? null,
  };

  if (args.tripShape === TRIP_SHAPES.ONE_WAY) {
    return args.waypoints.filter((s) => String(s.location || "").trim());
  }
  if (args.tripShape === TRIP_SHAPES.ROUND_TRIP) {
    return [...args.waypoints, returnStop];
  }
  return [...args.waypoints, destStop];
}

export function routeStopsEqual(a: RouteStopNormalized[], b: RouteStopNormalized[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].location !== b[i].location ||
      a[i].loadOut !== b[i].loadOut ||
      a[i].loadIn !== b[i].loadIn ||
      a[i].notes !== b[i].notes
    ) {
      return false;
    }
  }
  return true;
}
