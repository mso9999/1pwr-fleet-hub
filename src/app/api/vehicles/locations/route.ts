import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  getLastSnapshotBefore,
  pruneGpsSnapshots,
  recordGpsSnapshots,
  resolveAllVehicleHistory,
} from "@/lib/gps-history";

const SINOTRACK_SERVERS = ["https://245.sinotrack.com", "https://242.sinotrack.com"];
const SINOTRACK_PASSWORD = "123456";

interface TrackerPosition {
  lat: number;
  lng: number;
  speed: number;
  timestamp: number;
  direction: number;
  mileage: number;
}

async function fetchSinoTrackPosition(imei: string): Promise<TrackerPosition | null> {
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
      if (!posData.m_isResultOk || !posData.m_arrRecord || posData.m_arrRecord.length === 0) continue;

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
  HQ: { lat: -29.3387, lng: 27.4618 },
  MAK: { lat: -29.1929, lng: 27.5681 },
  MAS: { lat: -29.3902, lng: 27.5603 },
  SEB: { lat: -30.2921, lng: 27.8153 },
  MAT: { lat: -29.6181, lng: 27.5653 },
  LEB: { lat: -30.1793, lng: 27.9874 },
  SEH: { lat: -29.908, lng: 29.1169 },
  QN: { lat: -29.9657, lng: 28.7381 },
  TY: { lat: -29.152, lng: 27.7428 },
  BFN: { lat: -29.1164, lng: 26.2155 },
  JHB: { lat: -26.205, lng: 28.0497 },
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
  const rewindRaw = searchParams.get("rewindHours");
  let rewindHours = rewindRaw === null || rewindRaw === "" ? 0 : parseInt(rewindRaw, 10);
  if (Number.isNaN(rewindHours) || rewindHours < 0) rewindHours = 0;
  if (rewindHours > 144) rewindHours = 144;

  const db = getDb();
  const vehicles = db
    .prepare(
      `SELECT id, code, make, model, license_plate, current_location, status,
            tracker_imei, tracker_status, tracker_provider
     FROM vehicles
     WHERE organization_id = ?
     ORDER BY code`
    )
    .all(orgId) as VehicleRow[];

  const activeTripRows = db
    .prepare(`SELECT id AS trip_id, vehicle_id FROM trips WHERE organization_id = ? AND checkin_at IS NULL`)
    .all(orgId) as { trip_id: string; vehicle_id: string }[];
  const activeTripByVehicle = new Map<string, string>();
  for (const row of activeTripRows) {
    activeTripByVehicle.set(row.vehicle_id, row.trip_id);
  }

  const trackableVehicles = vehicles.filter((v) => v.tracker_imei && v.tracker_imei.length > 5);
  const gpsResults = await Promise.allSettled(trackableVehicles.map((v) => fetchSinoTrackPosition(v.tracker_imei)));
  const gpsMap = new Map<string, TrackerPosition>();
  trackableVehicles.forEach((v, i) => {
    const r = gpsResults[i];
    if (r.status === "fulfilled" && r.value) {
      gpsMap.set(v.tracker_imei, r.value);
    }
  });

  const nowUnix = Math.floor(Date.now() / 1000);
  const refUnix = nowUnix - rewindHours * 3600;

  const toRecord: Array<{
    vehicleId: string;
    lat: number;
    lng: number;
    sourceTs: number;
    speed: number;
    mileage: number;
  }> = [];
  for (const v of trackableVehicles) {
    const gps = gpsMap.get(v.tracker_imei);
    if (gps && gps.timestamp) {
      toRecord.push({
        vehicleId: v.id,
        lat: gps.lat,
        lng: gps.lng,
        sourceTs: gps.timestamp,
        speed: gps.speed,
        mileage: gps.mileage,
      });
    }
  }
  if (toRecord.length > 0) {
    recordGpsSnapshots(db, orgId, toRecord);
    if (Math.random() < 0.05) pruneGpsSnapshots(db, nowUnix);
  }

  const vehicleIds = vehicles.map((v) => v.id);
  const historyMap = resolveAllVehicleHistory(db, orgId, vehicleIds, refUnix);

  const result = vehicles.map((v) => {
    const siteKey = v.current_location?.toUpperCase() || "HQ";
    const coords = SITE_COORDINATES[siteKey] || SITE_COORDINATES["HQ"];
    const jitter = () => (Math.random() - 0.5) * 0.003;

    const gps = v.tracker_imei ? gpsMap.get(v.tracker_imei) : undefined;
    const isLiveGps = !!(gps && nowUnix - gps.timestamp < 7 * 86400);

    const hist = historyMap.get(v.id)!;
    let lat: number;
    let lng: number;
    let gpsLive = isLiveGps;
    let positionFromHistory = false;

    if (rewindHours === 0) {
      lat = isLiveGps ? gps!.lat : coords.lat + jitter();
      lng = isLiveGps ? gps!.lng : coords.lng + jitter();
    } else {
      let main = hist.mainFromHistory;
      if (!main) {
        main = getLastSnapshotBefore(db, v.id, refUnix);
      }
      if (main) {
        lat = main.lat;
        lng = main.lng;
        positionFromHistory = true;
        gpsLive = false;
      } else {
        lat = coords.lat;
        lng = coords.lng;
        gpsLive = false;
      }
    }

    const historyTrail = hist.trail.map((t) => ({
      hoursAgo: t.hoursAgo,
      lat: t.lat,
      lng: t.lng,
      sourceTs: t.sourceTs,
    }));

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
      activeTripId: activeTripByVehicle.get(v.id) || null,
      lat,
      lng,
      gpsLive,
      gpsTimestamp: gps?.timestamp || null,
      gpsSpeed: gps?.speed ?? null,
      gpsMileage: gps?.mileage ?? null,
      rewindHours,
      refTimeUnix: refUnix,
      historyTrail,
      positionFromHistory: rewindHours > 0 ? positionFromHistory : false,
    };
  });

  return NextResponse.json({ vehicles: result, sites: SITE_COORDINATES, serverTimeUnix: nowUnix });
}
