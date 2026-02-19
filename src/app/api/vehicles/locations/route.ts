import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const SITE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  HQ:    { lat: -29.3107, lng: 27.4785 },
  MAK:   { lat: -29.4498, lng: 28.0538 },
  MAS:   { lat: -29.3700, lng: 27.5500 },
  SEB:   { lat: -29.8387, lng: 28.0678 },
  MAT:   { lat: -29.3950, lng: 27.6850 },
  LEB:   { lat: -29.5994, lng: 28.0958 },
  SEH:   { lat: -29.8842, lng: 29.0683 },
  QN:    { lat: -30.1164, lng: 28.6828 },
  TY:    { lat: -29.1477, lng: 27.7452 },
  BFN:   { lat: -29.1217, lng: 26.2140 },
  JHB:   { lat: -26.2041, lng: 28.0473 },
  OTHER: { lat: -29.3107, lng: 27.4785 },
};

interface VehicleRow {
  id: string;
  code: string;
  make: string;
  model: string;
  license_plate: string;
  current_location: string;
  status: string;
  tracker_imei: string;
  tracker_status: string;
  tracker_provider: string;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("organizationId") || "1pwr_lesotho";

  const db = getDb();
  const vehicles = db.prepare(
    `SELECT id, code, make, model, license_plate, current_location, status,
            tracker_imei, tracker_status, tracker_provider
     FROM vehicles
     WHERE organization_id = ?
     ORDER BY code`
  ).all(orgId) as VehicleRow[];

  const result = vehicles.map((v) => {
    const siteKey = v.current_location?.toUpperCase() || "HQ";
    const coords = SITE_COORDINATES[siteKey] || SITE_COORDINATES["HQ"];
    // Jitter slightly so overlapping vehicles at same site are visible
    const jitter = () => (Math.random() - 0.5) * 0.003;
    return {
      id: v.id,
      code: v.code,
      make: v.make,
      model: v.model,
      licensePlate: v.license_plate,
      currentLocation: v.current_location,
      status: v.status,
      trackerImei: v.tracker_imei,
      trackerStatus: v.tracker_status,
      trackerProvider: v.tracker_provider,
      lat: coords.lat + jitter(),
      lng: coords.lng + jitter(),
    };
  });

  return NextResponse.json({ vehicles: result, sites: SITE_COORDINATES });
}
