import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";

type CountryCode = "LS" | "BN" | "BJ" | "ZM";

interface UgpCountryConfig {
  country_code?: string;
  country_name?: string;
  sites?: Record<string, unknown>;
}

interface SiteMetaPayload {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  country?: string;
  source?: string;
  source_country?: string;
  source_label?: string;
}

interface SyncOrgResult {
  organizationId: string;
  countryCode: string;
  upserted: number;
  created: number;
  updated: number;
  withCoords: number;
  missingCoords: number;
}

export interface UgpSitesSyncResult {
  success: boolean;
  source: string;
  organizations: SyncOrgResult[];
  upserted: number;
  created: number;
  updated: number;
  withCoords: number;
  missingCoords: number;
  error?: string;
}

const DEFAULT_UGP_BASE_URL = "https://ugp.1pwrafrica.com/api";
const DEFAULT_COUNTRIES: CountryCode[] = ["LS", "BN", "ZM"];

/**
 * Legacy fallback coordinates used in FM before external syncing existed.
 * Kept as last resort when UGP does not provide lat/lng for a known site.
 */
const LEGACY_SITE_COORDINATES: Record<string, { lat: number; lng: number }> = {
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

function parseCountryList(raw: string | undefined): CountryCode[] {
  if (!raw || !raw.trim()) return DEFAULT_COUNTRIES;
  const parts = raw
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean) as CountryCode[];
  return parts.length > 0 ? parts : DEFAULT_COUNTRIES;
}

function orgForCountry(countryCode: string): string | null {
  const cc = countryCode.toUpperCase();
  if (cc === "LS") return "1pwr_lesotho";
  if (cc === "BN" || cc === "BJ") return "1pwr_benin";
  if (cc === "ZM") return "1pwr_zambia";
  return null;
}

function parseNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSitePayload(siteCode: string, raw: unknown): { label: string; lat?: number; lng?: number } {
  if (typeof raw === "string") {
    const legacy = LEGACY_SITE_COORDINATES[siteCode];
    return { label: raw.trim() || siteCode, lat: legacy?.lat, lng: legacy?.lng };
  }

  if (!raw || typeof raw !== "object") {
    const legacy = LEGACY_SITE_COORDINATES[siteCode];
    return { label: siteCode, lat: legacy?.lat, lng: legacy?.lng };
  }

  const o = raw as Record<string, unknown>;
  const label = String(o.name ?? o.label ?? o.site_name ?? siteCode).trim() || siteCode;
  const lat = parseNumber(o.lat ?? o.latitude ?? o.gps_y ?? o.GPS_Y);
  const lng = parseNumber(o.lng ?? o.lon ?? o.longitude ?? o.gps_x ?? o.GPS_X);

  if (lat !== undefined && lng !== undefined) return { label, lat, lng };
  const legacy = LEGACY_SITE_COORDINATES[siteCode];
  return { label, lat: legacy?.lat, lng: legacy?.lng };
}

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function fetchCountryConfig(baseUrl: string, countryCode: CountryCode): Promise<UgpCountryConfig | null> {
  const cc = countryCode.toUpperCase();
  const url = `${baseUrl}/cc/config/${cc}`;
  const resp = await fetch(url, { method: "GET", cache: "no-store" });
  if (resp.ok) return (await resp.json()) as UgpCountryConfig;

  // Lesotho endpoint historically also exists at /cc/config with no suffix.
  if (cc === "LS") {
    const fallbackResp = await fetch(`${baseUrl}/cc/config`, { method: "GET", cache: "no-store" });
    if (fallbackResp.ok) return (await fallbackResp.json()) as UgpCountryConfig;
  }
  return null;
}

function upsertCountrySites(
  db: Database.Database,
  organizationId: string,
  countryCode: string,
  sites: Record<string, unknown>,
  sourceLabel: string
): SyncOrgResult {
  let upserted = 0;
  let created = 0;
  let updated = 0;
  let withCoords = 0;
  let missingCoords = 0;

  const txn = db.transaction(() => {
    for (const [rawCode, payload] of Object.entries(sites)) {
      const code = rawCode.trim().toUpperCase();
      if (!code) continue;

      const parsed = parseSitePayload(code, payload);
      const existing = db
        .prepare(
          "SELECT id, sort_order, meta FROM reference_data WHERE organization_id = ? AND type = 'site' AND code = ? LIMIT 1"
        )
        .get(organizationId, code) as { id: string; sort_order: number | null; meta: string | null } | undefined;

      const metaObj = parseMeta(existing?.meta);
      const nextMeta: SiteMetaPayload = {
        ...metaObj,
        country: countryCode,
        source: "ugp_cc_config",
        source_country: countryCode,
        source_label: sourceLabel,
      };

      if (parsed.lat !== undefined && parsed.lng !== undefined) {
        nextMeta.lat = parsed.lat;
        nextMeta.lng = parsed.lng;
        nextMeta.latitude = parsed.lat;
        nextMeta.longitude = parsed.lng;
        withCoords++;
      } else {
        missingCoords++;
      }

      const meta = JSON.stringify(nextMeta);
      if (existing) {
        db.prepare(
          `UPDATE reference_data
           SET label = ?, meta = ?, active = 1, updated_at = datetime('now')
           WHERE id = ?`
        ).run(parsed.label, meta, existing.id);
        updated++;
      } else {
        db.prepare(
          `INSERT INTO reference_data (id, organization_id, type, code, label, sort_order, active, meta)
           VALUES (lower(hex(randomblob(16))), ?, 'site', ?, ?, ?, 1, ?)`
        ).run(organizationId, code, parsed.label, 0, meta);
        created++;
      }
      upserted++;
    }
  });

  txn();
  return {
    organizationId,
    countryCode,
    upserted,
    created,
    updated,
    withCoords,
    missingCoords,
  };
}

export async function syncSitesFromUgp(dbArg?: Database.Database): Promise<UgpSitesSyncResult> {
  const db = dbArg ?? getDb();
  const baseUrl = (process.env.UGP_API_BASE_URL || DEFAULT_UGP_BASE_URL).replace(/\/+$/, "");
  const countries = parseCountryList(process.env.UGP_SITE_COUNTRIES);
  const organizations: SyncOrgResult[] = [];

  try {
    for (const countryCode of countries) {
      const orgId = orgForCountry(countryCode);
      if (!orgId) continue;
      const config = await fetchCountryConfig(baseUrl, countryCode);
      if (!config?.sites || typeof config.sites !== "object") continue;
      const sourceLabel = `${config.country_name || countryCode} (${countryCode})`;
      const orgResult = upsertCountrySites(db, orgId, countryCode, config.sites, sourceLabel);
      organizations.push(orgResult);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      source: `${baseUrl}/cc/config/*`,
      organizations,
      upserted: organizations.reduce((acc, row) => acc + row.upserted, 0),
      created: organizations.reduce((acc, row) => acc + row.created, 0),
      updated: organizations.reduce((acc, row) => acc + row.updated, 0),
      withCoords: organizations.reduce((acc, row) => acc + row.withCoords, 0),
      missingCoords: organizations.reduce((acc, row) => acc + row.missingCoords, 0),
      error: msg,
    };
  }

  return {
    success: true,
    source: `${baseUrl}/cc/config/*`,
    organizations,
    upserted: organizations.reduce((acc, row) => acc + row.upserted, 0),
    created: organizations.reduce((acc, row) => acc + row.created, 0),
    updated: organizations.reduce((acc, row) => acc + row.updated, 0),
    withCoords: organizations.reduce((acc, row) => acc + row.withCoords, 0),
    missingCoords: organizations.reduce((acc, row) => acc + row.missingCoords, 0),
  };
}
