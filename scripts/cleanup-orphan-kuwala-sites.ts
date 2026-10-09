#!/usr/bin/env tsx
/**
 * One-off, idempotent: deactivate FM site rows filed under the catalog-only
 * org id `kuwala` (orphans from an old unfiltered PR site sync), then remind
 * the operator to resync Zambia from the canonical catalog.
 *
 *   DB_PATH=/var/www/fleet-hub/data/fleet-hub.db npx tsx scripts/cleanup-orphan-kuwala-sites.ts          # dry run
 *   DB_PATH=/var/www/fleet-hub/data/fleet-hub.db npx tsx scripts/cleanup-orphan-kuwala-sites.ts --apply  # write
 *
 * The same cleanup also runs automatically at app start (db.ts migration step
 * "deactivateOrphanAliasOrgSites"), so after a deploy this script normally
 * reports 0 candidates. Rows are deactivated, never deleted; revert with
 *   UPDATE reference_data SET active = 1 WHERE id IN (<ids printed below>);
 *
 * Then resync Zambia sites (reads referenceData_sites for 1pwr_zambia + kuwala):
 *   curl -X POST "https://fm.1pwrafrica.com/api/sync/sites?org=1pwr_zambia"
 */
async function main(): Promise<void> {
  if (!process.env.DB_PATH) {
    console.error("Set DB_PATH to the Fleet Hub SQLite file (refusing to open cwd/fleet-hub.db).");
    process.exit(2);
  }
  const apply = process.argv.includes("--apply");
  const { getDb } = await import("../src/lib/db");
  const { deactivateOrphanAliasOrgSites } = await import("../src/lib/orphan-site-cleanup");
  const result = deactivateOrphanAliasOrgSites(getDb(), { apply });
  console.log(JSON.stringify(result, null, 2));
  console.log(
    apply
      ? `Deactivated ${result.deactivated} row(s). Now POST /api/sync/sites?org=1pwr_zambia.`
      : `Dry run: ${result.candidates.length} candidate row(s). Re-run with --apply to write.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
