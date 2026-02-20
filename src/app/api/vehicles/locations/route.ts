import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const SINOTRACK_SERVERS = [
  "https://245.sinotrack.com",
  "https://242.sinotrack.com",
];
const SINOTRACK_PASSWORD = "123456";

interface TrackerPosition {
  lat: number;
  lng: number;
  speed: number;
  timestamp: number;
  direction: number;
  mileage: number;
}

async function fetchSinoTrackPosition(
  imei: string
): Promise<TrackerPosition | null> {
  for (const server of SINOTRACK_SERVERS) {
    try {
      const url = `${server}/APP/AppJson.asp`;
      const ts = String(Date.now());
      const baseParams = new URLSearchParams({
        Field: "",
        strAppID: "",
        strUser: imei,
        nTimeStamp: ts,
        strRandom: "12345",
        strSign: "",
        strToken: "",
      });

      // Login
      const loginParams = new URLSearchParams(baseParams);
      loginParams.set("Cmd", "Proc_LoginIMEI");
      loginParams.set("Data", `N'${imei}',N'${SINOTRACK_PASSWORD}'`);
      const loginResp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: loginParams.toString(),
        signal: AbortSignal.timeout(6000),
      });
      const loginData = await loginResp.json();
      if (!loginData.m_isResultOk) continue;

      // Get position
      const posParams = new URLSearchParams(baseParams);
      posParams.set("Cmd", "Proc_GetLastPosition");
      posParams.set("Data", `N'${imei}'`);
      const posResp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: posParams.toString(),
        signal: AbortSignal.timeout(6000),
      });
      const posData = await posResp.json();
      if (
        !posData.m_isResultOk ||
        !posData.m_arrRecord ||
        posData.m_arrRecord.length === 0
      )
        continue;

      const fields: string[] = posData.m_arrField;
      const vals: string[] = posData.m_arrRecord[0];
      const rec: Record<string, string> = {};
      fields.forEach((f: string, i: number) => {
        rec[f] = vals[i];
      });

      const lat = parseFloat(rec.dbLat);
      const lng = parseFloat(rec.dbLon);
      if (!lat || !lng || (lat === 0 && lng === 0)) continue;

      return {
        lat,
        lng,
        speed: parseInt(rec.nSpeed || "0", 10),
        timestamp: parseInt(rec.nTime || "0", 10),
        direction: parseInt(rec.nDirection || "0", 10),
        mileage: parseInt(rec.nMileage || "0", 10),
      };
    } catch {
      continue;
    }
  }
  return null;
}

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

  // Fetch live GPS for vehicles with active trackers (in parallel)
  const trackableVehicles = vehicles.filter(
    (v) => v.tracker_imei && v.tracker_imei.length > 5
  );
  const gpsResults = await Promise.allSettled(
    trackableVehicles.map((v) => fetchSinoTrackPosition(v.tracker_imei))
  );
  const gpsMap = new Map<string, TrackerPosition>();
  trackableVehicles.forEach((v, i) => {
    const r = gpsResults[i];
    if (r.status === "fulfilled" && r.value) {
      gpsMap.set(v.tracker_imei, r.value);
    }
  });

  const now = Math.floor(Date.now() / 1000);
  const result = vehicles.map((v) => {
    const siteKey = v.current_location?.toUpperCase() || "HQ";
    const coords = SITE_COORDINATES[siteKey] || SITE_COORDINATES["HQ"];
    const jitter = () => (Math.random() - 0.5) * 0.003;

    const gps = v.tracker_imei ? gpsMap.get(v.tracker_imei) : undefined;
    const isLiveGps = !!(gps && now - gps.timestamp < 7 * 86400); // within 7 days

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
      lat: isLiveGps ? gps!.lat : coords.lat + jitter(),
      lng: isLiveGps ? gps!.lng : coords.lng + jitter(),
      gpsLive: isLiveGps,
      gpsTimestamp: gps?.timestamp || null,
      gpsSpeed: gps?.speed ?? null,
      gpsMileage: gps?.mileage ?? null,
    };
  });

  return NextResponse.json({ vehicles: result, sites: SITE_COORDINATES });
}
