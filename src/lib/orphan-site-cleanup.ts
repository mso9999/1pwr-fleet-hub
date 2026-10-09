/**
 * Deactivate FM site rows filed under catalog-only org ids (today: `kuwala`).
 *
 * Before the org filter in firestore-sync, a sync run with org=kuwala mirrored
 * every country's sites into reference_data under `kuwala`. `kuwala` is not an
 * FM organization (FM's Zambia org is `1pwr_zambia`), so these rows are
 * invisible orphans and some carry the wrong country's coordinates.
 *
 * Idempotent: only touches rows that are still active; never deletes. Rows
 * keep their data so the change can be reverted with
 *   UPDATE reference_data SET active = 1 WHERE id IN (...)
 */
import type Database from "better-sqlite3";
import { recordMutation } from "./record-mutation-log";
import { aliasOnlySiteOrgIds } from "./site-orgs";

const ACTOR = { id: "system", name: "Orphan site cleanup", role: "system", department: "" };

export interface OrphanSiteRow {
  id: string;
  organization_id: string;
  code: string;
  label: string;
}

export interface OrphanSiteCleanupResult {
  orgIds: string[];
  candidates: OrphanSiteRow[];
  deactivated: number;
  applied: boolean;
}

export function deactivateOrphanAliasOrgSites(
  db: Database.Database,
  options: { apply: boolean } = { apply: true },
): OrphanSiteCleanupResult {
  // Never touch an org that FM actually has (defensive: if `kuwala` is ever
  // added as a real FM organization, its rows stop being orphans).
  const fmOrgs = new Set(
    (db.prepare("SELECT id FROM organizations").all() as Array<{ id: string }>).map((r) => r.id),
  );
  const orgIds = aliasOnlySiteOrgIds().filter((o) => !fmOrgs.has(o));
  if (orgIds.length === 0) return { orgIds, candidates: [], deactivated: 0, applied: options.apply };

  const placeholders = orgIds.map(() => "?").join(", ");
  const candidates = db
    .prepare(
      `SELECT id, organization_id, code, label FROM reference_data
       WHERE type = 'site' AND active = 1 AND organization_id IN (${placeholders})
       ORDER BY organization_id, code`,
    )
    .all(...orgIds) as OrphanSiteRow[];

  let deactivated = 0;
  if (options.apply && candidates.length > 0) {
    const upd = db.prepare(
      "UPDATE reference_data SET active = 0, updated_at = datetime('now') WHERE id = ? AND active = 1",
    );
    db.transaction(() => {
      for (const row of candidates) {
        const changed = upd.run(row.id).changes;
        if (changed !== 1) continue;
        deactivated++;
        recordMutation(db, {
          entityType: "reference_data",
          entityId: row.id,
          organizationId: row.organization_id,
          action: "update",
          actor: ACTOR,
          before: { active: 1, code: row.code, label: row.label },
          after: { active: 0 },
          reason: "orphan_alias_org_site",
        });
      }
    })();
  }
  return { orgIds, candidates, deactivated, applied: options.apply };
}
