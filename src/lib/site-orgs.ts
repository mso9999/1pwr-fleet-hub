/**
 * Organization mapping between Fleet Hub (FM) and the canonical Nexus/PR site
 * catalog (`referenceData_sites`).
 *
 * FM knows Zambia as `1pwr_zambia`. Nexus/HR file Zambian records under the
 * asset-owner org `kuwala` (2026-08-28 split) and uGP's canonical-site ingest
 * writes Zambia under `1pwr_zambia`, so FM must read both for its Zambia org.
 */
import type Database from "better-sqlite3";

/** Canonical catalog org ids whose sites belong to each FM org (FM org first). */
const CANONICAL_SITE_ORG_ALIASES: Record<string, string[]> = {
  "1pwr_zambia": ["1pwr_zambia", "kuwala"],
};

/** Canonical `referenceData_sites.organizationId` values to mirror into an FM org. */
export function canonicalSiteOrgIds(fmOrganizationId: string): string[] {
  const org = String(fmOrganizationId || "").trim();
  return CANONICAL_SITE_ORG_ALIASES[org] ?? [org];
}

/**
 * Catalog org ids that are NOT FM organizations, only aliases folded into one.
 * Any FM `reference_data` rows stored under these ids are orphans that no FM
 * screen can show (see orphan-site-cleanup.ts).
 */
export function aliasOnlySiteOrgIds(): string[] {
  const fmOrgs = new Set(Object.keys(CANONICAL_SITE_ORG_ALIASES));
  const out = new Set<string>();
  for (const aliases of Object.values(CANONICAL_SITE_ORG_ALIASES)) {
    for (const a of aliases) if (!fmOrgs.has(a)) out.add(a);
  }
  return [...out];
}

export interface CanonicalSiteDocLike {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Pick the canonical site docs to mirror into an FM org: only docs whose
 * organizationId is one of the org's aliases, active, one per site code. When
 * the same code exists under several aliases the FM org's own doc wins, then
 * the earlier alias in the list.
 */
export function selectCanonicalSiteDocsForOrg<T extends CanonicalSiteDocLike>(
  docs: T[],
  fmOrganizationId: string,
): T[] {
  const aliases = canonicalSiteOrgIds(fmOrganizationId);
  const rank = new Map(aliases.map((a, i) => [a, i]));
  const byCode = new Map<string, { doc: T; rank: number }>();
  for (const doc of docs) {
    const data = doc.data || {};
    if (data.active === false) continue;
    const docOrg = String(data.organizationId || "").trim();
    // Docs without an org keep the legacy behaviour (accepted for any org).
    const r = docOrg ? rank.get(docOrg) : 0;
    if (r === undefined) continue;
    const code = String(data.code || doc.id).trim();
    if (!code) continue;
    const prev = byCode.get(code);
    if (!prev || r < prev.rank) byCode.set(code, { doc, rank: r });
  }
  return [...byCode.values()].map((v) => v.doc);
}

/** ISO-2 country of an FM organization (organizations.country), or null. */
export function fmOrganizationCountry(db: Database.Database, organizationId: string): string | null {
  if (!organizationId) return null;
  try {
    const row = db.prepare("SELECT country FROM organizations WHERE id = ?").get(organizationId) as
      | { country?: string | null }
      | undefined;
    const c = String(row?.country || "").trim().toUpperCase();
    return c || null;
  } catch {
    return null;
  }
}

/**
 * The hard-coded legacy site coordinates in FM are Lesotho sites (Maseru HQ,
 * Makhunoane, …). They may only ever be used for Lesotho orgs; for any other
 * country they put Zambian/Beninese pins and route origins in Lesotho.
 */
export function usesLesothoLegacySiteCoords(db: Database.Database, organizationId: string): boolean {
  if (organizationId === "1pwr_lesotho") return true;
  return fmOrganizationCountry(db, organizationId) === "LS";
}
