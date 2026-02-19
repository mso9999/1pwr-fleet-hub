import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const SITE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  HQ:    { lat: -29.3387, lng: 27.4618 },
  MAK:   { lat: -29.1929, lng: 27.5681 },
  MAS:   { lat: -29.3902, lng: 27.5603 },
  SEB:   { lat: -30.2921, lng: 27.8153 },
  MAT:   { lat: -29.6181, lng: 27.5653 },
  LEB:   { lat: -30.1793, lng: 27.9874 },
  SEH:   { lat: -29.9080, lng: 29.1169 },
  QN:    { lat: -29.9657, lng: 28.7381 },
  TY:    { lat: -29.1520, lng: 27.7428 },
  BFN:   { lat: -29.1164, lng: 26.2155 },
  JHB:   { lat: -26.2050, lng: 28.0497 },
  OTHER: { lat: -29.3387, lng: 27.4618 },
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
