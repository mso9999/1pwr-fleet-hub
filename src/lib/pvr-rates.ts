/**
 * Personal vehicle reimbursement — rates come from `pvr_rate_settings` (Admin, finance/superadmin only).
 * Until a row exists for an org, F006-aligned defaults apply (same as legacy spreadsheet).
 */

import type Database from "better-sqlite3";

export type PvrRateBand = "full" | "half";
export type PvrFeeType = "hq_round_trip" | "per_km";

export interface PvrRateSnapshot {
  fullPerKmLsl: number;
  halfPerKmLsl: number;
  hqBasisKm: number;
  hqFlatFullLsl: number;
  hqFlatHalfLsl: number;
}

/** Defaults when no row in `pvr_rate_settings` (F006 evaluated values). */
const DEFAULT_FULL_PER_KM = 5.06;
const DEFAULT_HALF_PER_KM = 2.53;
const DEFAULT_HQ_BASIS_KM = 20;

export function buildPvrRateSnapshot(
  fullPerKmLsl: number,
  halfPerKmLsl: number,
  hqBasisKm: number
): PvrRateSnapshot {
  return {
    fullPerKmLsl,
    halfPerKmLsl,
    hqBasisKm,
    hqFlatFullLsl: fullPerKmLsl * hqBasisKm,
    hqFlatHalfLsl: halfPerKmLsl * hqBasisKm,
  };
}

const DEFAULT_SNAPSHOT = buildPvrRateSnapshot(
  DEFAULT_FULL_PER_KM,
  DEFAULT_HALF_PER_KM,
  DEFAULT_HQ_BASIS_KM
);

export function getFallbackPvrRateSnapshot(): PvrRateSnapshot {
  return DEFAULT_SNAPSHOT;
}

/**
 * Active policy for an organization: DB row if present, otherwise defaults.
 */
export function getPvrRateSnapshotForOrg(db: Database.Database, organizationId: string): PvrRateSnapshot {
  const row = db
    .prepare(
      `SELECT full_per_km_lsl, half_per_km_lsl, hq_basis_km FROM pvr_rate_settings WHERE organization_id = ?`
    )
    .get(organizationId) as
    | { full_per_km_lsl: number; half_per_km_lsl: number; hq_basis_km: number }
    | undefined
    | null;

  if (!row) return getFallbackPvrRateSnapshot();

  const f = Number(row.full_per_km_lsl);
  const h = Number(row.half_per_km_lsl);
  const b = Number(row.hq_basis_km);
  if (!Number.isFinite(f) || f <= 0 || !Number.isFinite(h) || h <= 0 || !Number.isFinite(b) || b <= 0) {
    return getFallbackPvrRateSnapshot();
  }

  return buildPvrRateSnapshot(f, h, b);
}

const MIN_JUSTIFICATION_FULL = 20;

export function validateJustificationForFullPerKm(justification: string): string | null {
  const t = justification.trim();
  if (t.length < MIN_JUSTIFICATION_FULL) {
    return `Explanation for using a personal vehicle (instead of a 1PWR vehicle) must be at least ${MIN_JUSTIFICATION_FULL} characters for full-rate per-km claims.`;
  }
  return null;
}

export function computeReimbursementLsl(
  rateBand: PvrRateBand,
  feeType: PvrFeeType,
  totalKm: number | null | undefined,
  rates: PvrRateSnapshot
): number {
  if (feeType === "hq_round_trip") {
    return rateBand === "full" ? rates.hqFlatFullLsl : rates.hqFlatHalfLsl;
  }
  const km = totalKm ?? 0;
  const perKm = rateBand === "full" ? rates.fullPerKmLsl : rates.halfPerKmLsl;
  return Math.round(km * perKm * 100) / 100;
}
