import type Database from "better-sqlite3";
import { haversineKm } from "@/lib/route-distance";

const GENERIC_HQ = "HQ";
const ORIGIN_MATCH_KM = 1;

interface SiteRow {
  code: string;
  label: string;
  meta: string | null;
  sort_order: number | null;
}

function coords(meta: string | null): { lat: number; lng: number } | null {
  if (!meta) return null;
  try {
    const o = JSON.parse(meta) as Record<string, unknown>;
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number(o.lng ?? o.longitude);
    if (o.lat == null && o.latitude == null) return null;
    if (o.lng == null && o.longitude == null) return null;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/**
 * The organization's active HQ site code.
 * 1. An active site coded `HQ` (Lesotho, Benin).
 * 2. The active site at the org's route origin (Zambia: LSK "LUN HQ (Lusaka)"; its `HQ` row is an inactive Benin leftover).
 * 3. The first active site labelled HQ / Headquarters.
 * 4. `HQ` as a last resort.
 */
export function orgHqSiteCode(db: Database.Database, organizationId: string): string {
  const org = String(organizationId || "").trim().toLowerCase();
  let sites: SiteRow[] = [];
  try {
    sites = db
      .prepare(
        `SELECT code, label, meta, sort_order FROM reference_data
         WHERE organization_id = ? AND type = 'site' AND active = 1
         ORDER BY sort_order, code`
      )
      .all(org) as SiteRow[];
  } catch {
    return GENERIC_HQ;
  }
  if (sites.some((s) => String(s.code).toUpperCase() === GENERIC_HQ)) return GENERIC_HQ;

  try {
    const o = db
      .prepare("SELECT route_origin_lat AS lat, route_origin_lng AS lng FROM organizations WHERE id = ?")
      .get(org) as { lat: number | null; lng: number | null } | undefined;
    if (o && typeof o.lat === "number" && typeof o.lng === "number") {
      const origin = { lat: o.lat, lng: o.lng };
      const atOrigin = sites.find((s) => {
        const c = coords(s.meta);
        return c != null && haversineKm(origin, c) <= ORIGIN_MATCH_KM;
      });
      if (atOrigin) return atOrigin.code;
    }
  } catch {
    // organizations table without route origin columns: fall through
  }

  const labelled = sites.find((s) => /\bHQ\b|headquarters/i.test(`${s.label} ${s.code}`));
  return labelled ? labelled.code : GENERIC_HQ;
}

/**
 * Home/current location for a new vehicle. Blank, or the generic `HQ` in an org whose `HQ`
 * site is not active, resolves to the org's real HQ site; anything else is kept as given.
 */
export function resolveVehicleSite(
  db: Database.Database,
  organizationId: string,
  requested: unknown
): string {
  const raw = String(requested ?? "").trim();
  if (raw && raw.toUpperCase() !== GENERIC_HQ) return raw;
  return orgHqSiteCode(db, organizationId);
}
