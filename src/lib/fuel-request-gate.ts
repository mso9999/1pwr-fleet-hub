/**
 * Vehicle fuel is requested only after the trip exists and a real vehicle is on it.
 * The purchase request is then filed against that trip.
 */

export const PR_APP_BASE_URL = "https://pr.1pwrafrica.com";

export type FuelRequestGateInput = {
  id: string;
  trip_id?: string | null;
  assigned_vehicle_id?: string | null;
  assigned_vehicle_code?: string | null;
  fuel_budget?: number | null;
};

export type FuelRequestGate =
  | { ready: false; reason: "create_trip"; href: string }
  | { ready: false; reason: "assign_vehicle"; tripId: string }
  | { ready: false; reason: "no_budget"; tripId: string }
  | { ready: true; tripId: string };

export function hasAssignedVehicle(m: Pick<FuelRequestGateInput, "assigned_vehicle_id" | "assigned_vehicle_code">): boolean {
  const id = String(m.assigned_vehicle_id || "").trim();
  if (!id) return false;
  if (id.startsWith("unallocated_")) return false;
  if (String(m.assigned_vehicle_code || "").toUpperCase() === "UNALLOCATED") return false;
  return true;
}

export function fuelRequestGate(m: FuelRequestGateInput): FuelRequestGate {
  const tripId = String(m.trip_id || "").trim();
  if (!tripId) {
    return { ready: false, reason: "create_trip", href: `/trips?mission=${encodeURIComponent(m.id)}` };
  }
  if (!hasAssignedVehicle(m)) {
    return { ready: false, reason: "assign_vehicle", tripId };
  }
  if (!(Number(m.fuel_budget) > 0)) {
    return { ready: false, reason: "no_budget", tripId };
  }
  return { ready: true, tripId };
}

export function fuelPrUrl(args: { missionId: string; tripId: string; organizationId: string }): string {
  const q = new URLSearchParams({
    mission: args.missionId,
    trip: args.tripId,
    org: args.organizationId,
  });
  return `${PR_APP_BASE_URL}/fuel-pr?${q.toString()}`;
}
