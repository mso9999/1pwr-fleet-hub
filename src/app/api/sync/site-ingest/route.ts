import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getDb } from "@/lib/db";

interface SiteIngestPayload {
  source?: "ugp" | "pr_admin";
  eventType?: "site.created" | "site.updated" | "site.deactivated";
  idempotencyKey?: string;
  updatedAt?: string;
  site?: {
    organizationId?: string;
    countryCode?: string;
    code?: string;
    name?: string;
    active?: boolean;
    latitude?: number;
    longitude?: number;
    externalIds?: Record<string, string>;
  };
}

function expectedApiKey(): string {
  return String(process.env.SITE_SYNC_FANOUT_API_KEY || "").trim();
}

function isAuthorized(req: NextRequest): boolean {
  const provided = req.headers.get("x-api-key")?.trim() || "";
  const expected = expectedApiKey();
  if (expected && provided && expected === provided) return true;

  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim() || "";
  const adminBearer = String(process.env.FIREBASE_ADMIN_BEARER_TOKEN || "").trim();
  return !!(adminBearer && bearer && adminBearer === bearer);
}

function normalizeOrgId(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMeta(meta: string | null | undefined): Record<string, unknown> {
  if (!meta) return {};
  try {
    const obj = JSON.parse(meta) as Record<string, unknown>;
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function defaultIdempotency(payload: SiteIngestPayload): string {
  const updatedAt = payload.updatedAt || new Date().toISOString();
  const source = payload.source || "pr_admin";
  const eventType = payload.eventType || "site.updated";
  const organizationId = normalizeOrgId(String(payload.site?.organizationId || ""));
  const code = String(payload.site?.code || "").trim().toUpperCase();
  return createHash("sha1")
    .update(`${source}|${organizationId}|${code}|${eventType}|${updatedAt}`)
    .digest("hex");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await req.json()) as SiteIngestPayload;
  const site = payload.site || {};
  const organizationId = normalizeOrgId(String(site.organizationId || ""));
  const code = String(site.code || "").trim().toUpperCase();
  const name = String(site.name || "").trim();
  const latitude = toNumber(site.latitude);
  const longitude = toNumber(site.longitude);
  const active = site.active !== false;

  if (!organizationId || !code || !name || latitude === null || longitude === null) {
    return NextResponse.json(
      { success: false, error: "site.organizationId, site.code, site.name, site.latitude and site.longitude are required" },
      { status: 400 }
    );
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ success: false, error: "Coordinates are out of bounds" }, { status: 400 });
  }

  const idempotencyKey = String(payload.idempotencyKey || defaultIdempotency(payload));
  const updatedAt = String(payload.updatedAt || new Date().toISOString());
  const countryCode = String(site.countryCode || "").trim().toUpperCase();
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_sync_events (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_site_sync_events_key ON site_sync_events(idempotency_key);
  `);

  const seen = db
    .prepare("SELECT id FROM site_sync_events WHERE idempotency_key = ? LIMIT 1")
    .get(idempotencyKey) as { id: string } | undefined;
  if (seen) {
    return NextResponse.json({ success: true, idempotent: true, idempotencyKey });
  }

  const existing = db
    .prepare(
      "SELECT id, meta FROM reference_data WHERE organization_id = ? AND type = 'site' AND code = ? LIMIT 1"
    )
    .get(organizationId, code) as { id: string; meta: string | null } | undefined;

  const existingMeta = parseMeta(existing?.meta);
  const nextMeta = JSON.stringify({
    ...existingMeta,
    latitude,
    longitude,
    lat: latitude,
    lng: longitude,
    country: countryCode || existingMeta.country || "",
    source: payload.source || "pr_admin",
    externalIds: site.externalIds || existingMeta.externalIds || {},
    lastEventType: payload.eventType || "site.updated",
    lastIdempotencyKey: idempotencyKey,
    lastUpdatedAt: updatedAt,
  });

  const tx = db.transaction(() => {
    if (existing) {
      db.prepare(
        `UPDATE reference_data
         SET label = ?, active = ?, meta = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(name, active ? 1 : 0, nextMeta, existing.id);
    } else {
      db.prepare(
        `INSERT INTO reference_data (id, organization_id, type, code, label, sort_order, active, meta)
         VALUES (lower(hex(randomblob(16))), ?, 'site', ?, ?, 0, ?, ?)`
      ).run(organizationId, code, name, active ? 1 : 0, nextMeta);
    }

    db.prepare(
      `INSERT INTO site_sync_events (id, idempotency_key, payload_json, created_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, datetime('now'))`
    ).run(idempotencyKey, JSON.stringify(payload));
  });

  tx();
  return NextResponse.json({ success: true, idempotent: false, idempotencyKey });
}
