import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

const NEAR_WINDOW_SEC = 3 * 3600;
const PRUNE_MAX_AGE_SEC = 20 * 24 * 3600;
/** Load extra history before the 5h trail window so sparse snapshots still resolve. */
const TRAIL_LOOKBACK_SEC = 3 * 24 * 3600;

export interface GpsSnapshotRow {
  lat: number;
  lng: number;
  sourceTs: number;
}

/**
 * Insert live GPS points (deduped by vehicle_id + source_ts). Call after each successful tracker fetch.
 */
export function recordGpsSnapshots(
  db: Database.Database,
  organizationId: string,
  rows: Array<{
    vehicleId: string;
    lat: number;
    lng: number;
    sourceTs: number;
    speed: number;
    mileage: number;
  }>
): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO vehicle_gps_snapshots (id, vehicle_id, organization_id, lat, lng, source_ts, speed, mileage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const run = db.transaction(() => {
    for (const r of rows) {
      if (!r.sourceTs || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
      stmt.run(
        uuidv4(),
        r.vehicleId,
        organizationId,
        r.lat,
        r.lng,
        r.sourceTs,
        r.speed,
        r.mileage
      );
    }
  });
  run();
}

/** Delete very old rows to cap DB growth (retention >> 144h requirement). */
export function pruneGpsSnapshots(db: Database.Database, nowUnix: number): void {
  const cutoff = nowUnix - PRUNE_MAX_AGE_SEC;
  db.prepare(`DELETE FROM vehicle_gps_snapshots WHERE source_ts < ?`).run(cutoff);
}

function nearestInWindow(
  points: Array<{ lat: number; lng: number; source_ts: number }>,
  targetTs: number
): GpsSnapshotRow | null {
  let best: { lat: number; lng: number; source_ts: number } | null = null;
  let bestD = Infinity;
  for (const p of points) {
    if (p.source_ts < targetTs - NEAR_WINDOW_SEC || p.source_ts > targetTs + NEAR_WINDOW_SEC) continue;
    const d = Math.abs(p.source_ts - targetTs);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (best) return { lat: best.lat, lng: best.lng, sourceTs: best.source_ts };
  const before = points.filter((p) => p.source_ts <= targetTs);
  if (before.length === 0) return null;
  before.sort((a, b) => b.source_ts - a.source_ts);
  const p = before[0];
  return { lat: p.lat, lng: p.lng, sourceTs: p.source_ts };
}

/**
 * Load snapshots for [minTs, maxTs] for an org, grouped by vehicle_id.
 */
function loadSnapshotWindow(
  db: Database.Database,
  organizationId: string,
  minTs: number,
  maxTs: number
): Map<string, Array<{ lat: number; lng: number; source_ts: number }>> {
  const rows = db
    .prepare(
      `SELECT vehicle_id, lat, lng, source_ts FROM vehicle_gps_snapshots
       WHERE organization_id = ? AND source_ts >= ? AND source_ts <= ?
       ORDER BY source_ts ASC`
    )
    .all(organizationId, minTs, maxTs) as Array<{
    vehicle_id: string;
    lat: number;
    lng: number;
    source_ts: number;
  }>;
  const map = new Map<string, Array<{ lat: number; lng: number; source_ts: number }>>();
  for (const r of rows) {
    const list = map.get(r.vehicle_id) || [];
    list.push({ lat: r.lat, lng: r.lng, source_ts: r.source_ts });
    map.set(r.vehicle_id, list);
  }
  return map;
}

export interface TrailPoint {
  hoursAgo: number;
  lat: number | null;
  lng: number | null;
  sourceTs: number | null;
}

export interface VehicleHistoryPositions {
  /** Nearest to refUnix — used when rewindHours > 0 for main marker */
  mainFromHistory: GpsSnapshotRow | null;
  /** 1..5 hours before refUnix (newest trail index = 1h ago) */
  trail: TrailPoint[];
}

/** Last known position at or before refUnix (wider than the 8h batch window). */
export function getLastSnapshotBefore(
  db: Database.Database,
  vehicleId: string,
  refUnix: number
): GpsSnapshotRow | null {
  const row = db
    .prepare(
      `SELECT lat, lng, source_ts FROM vehicle_gps_snapshots
       WHERE vehicle_id = ? AND source_ts <= ?
       ORDER BY source_ts DESC LIMIT 1`
    )
    .get(vehicleId, refUnix) as { lat: number; lng: number; source_ts: number } | undefined;
  if (!row) return null;
  return { lat: row.lat, lng: row.lng, sourceTs: row.source_ts };
}

export function resolveAllVehicleHistory(
  db: Database.Database,
  organizationId: string,
  vehicleIds: string[],
  refUnix: number
): Map<string, VehicleHistoryPositions> {
  const minTs = refUnix - 5 * 3600 - NEAR_WINDOW_SEC - TRAIL_LOOKBACK_SEC;
  const maxTs = refUnix + NEAR_WINDOW_SEC;
  const map = loadSnapshotWindow(db, organizationId, minTs, maxTs);
  const out = new Map<string, VehicleHistoryPositions>();
  for (const vid of vehicleIds) {
    const points = map.get(vid) || [];
    const mainFromHistory = nearestInWindow(points, refUnix);
    const trail: TrailPoint[] = [];
    for (let h = 1; h <= 5; h++) {
      const targetTs = refUnix - h * 3600;
      const n = nearestInWindow(points, targetTs);
      trail.push(
        n
          ? { hoursAgo: h, lat: n.lat, lng: n.lng, sourceTs: n.sourceTs }
          : { hoursAgo: h, lat: null, lng: null, sourceTs: null }
      );
    }
    out.set(vid, { mainFromHistory, trail });
  }
  return out;
}
