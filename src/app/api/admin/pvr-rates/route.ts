import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, isFinanceOrSuperAdmin } from "@/lib/server-auth";
import {
  buildPvrRateSnapshot,
  getFallbackPvrRateSnapshot,
  getPvrRateSnapshotForOrg,
} from "@/lib/pvr-rates";

/**
 * GET /api/admin/pvr-rates?org=
 * Read current policy (defaults if unset). Finance or superadmin only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !isFinanceOrSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  const row = db
    .prepare(
      `SELECT organization_id, full_per_km_lsl, half_per_km_lsl, hq_basis_km, updated_at, updated_by_id, updated_by_name
       FROM pvr_rate_settings WHERE organization_id = ?`
    )
    .get(org) as
    | {
        organization_id: string;
        full_per_km_lsl: number;
        half_per_km_lsl: number;
        hq_basis_km: number;
        updated_at: string;
        updated_by_id: string;
        updated_by_name: string;
      }
    | undefined
    | null;

  const fallback = getFallbackPvrRateSnapshot();
  const snapshot = getPvrRateSnapshotForOrg(db, org);

  return NextResponse.json({
    organizationId: org,
    snapshot,
    source: row ? "database" : "defaults",
    row: row
      ? {
          fullPerKmLsl: row.full_per_km_lsl,
          halfPerKmLsl: row.half_per_km_lsl,
          hqBasisKm: row.hq_basis_km,
          updatedAt: row.updated_at,
          updatedById: row.updated_by_id,
          updatedByName: row.updated_by_name,
        }
      : null,
    defaults: fallback,
  });
}

/**
 * PUT /api/admin/pvr-rates
 * Body: { organizationId?, fullPerKmLsl, halfPerKmLsl, hqBasisKm }
 * Finance or superadmin only.
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !isFinanceOrSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    organizationId?: string;
    fullPerKmLsl?: unknown;
    halfPerKmLsl?: unknown;
    hqBasisKm?: unknown;
  };

  const organizationId = body.organizationId || "1pwr_lesotho";
  const fullPerKmLsl = Number(body.fullPerKmLsl);
  const halfPerKmLsl = Number(body.halfPerKmLsl);
  const hqBasisKm = Number(body.hqBasisKm);

  if (!Number.isFinite(fullPerKmLsl) || fullPerKmLsl <= 0) {
    return NextResponse.json({ error: "fullPerKmLsl must be a positive number." }, { status: 400 });
  }
  if (!Number.isFinite(halfPerKmLsl) || halfPerKmLsl <= 0) {
    return NextResponse.json({ error: "halfPerKmLsl must be a positive number." }, { status: 400 });
  }
  if (!Number.isFinite(hqBasisKm) || hqBasisKm <= 0) {
    return NextResponse.json({ error: "hqBasisKm must be a positive number." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `
    INSERT INTO pvr_rate_settings (
      organization_id, full_per_km_lsl, half_per_km_lsl, hq_basis_km, updated_at, updated_by_id, updated_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id) DO UPDATE SET
      full_per_km_lsl = excluded.full_per_km_lsl,
      half_per_km_lsl = excluded.half_per_km_lsl,
      hq_basis_km = excluded.hq_basis_km,
      updated_at = excluded.updated_at,
      updated_by_id = excluded.updated_by_id,
      updated_by_name = excluded.updated_by_name
  `
  ).run(
    organizationId,
    fullPerKmLsl,
    halfPerKmLsl,
    hqBasisKm,
    now,
    user.id,
    user.name
  );

  const snapshot = buildPvrRateSnapshot(fullPerKmLsl, halfPerKmLsl, hqBasisKm);
  return NextResponse.json({
    organizationId,
    snapshot,
    source: "database" as const,
    updatedAt: now,
  });
}
