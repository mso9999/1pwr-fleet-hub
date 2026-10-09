/**
 * Zambia site sync: kuwala alias, Lesotho-only legacy coordinates, orphan cleanup.
 * Run with: npx tsx scripts/test-zm-site-sync.ts (isolated temp DB).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-zm-sites-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");

async function main(): Promise<void> {
  const {
    canonicalSiteOrgIds,
    aliasOnlySiteOrgIds,
    selectCanonicalSiteDocsForOrg,
    usesLesothoLegacySiteCoords,
  } = await import("../src/lib/site-orgs");
  const { deactivateOrphanAliasOrgSites } = await import("../src/lib/orphan-site-cleanup");
  const { getSiteCoordsByCode } = await import("../src/lib/vehicle-request-fuel");
  const { getDb } = await import("../src/lib/db");

  // Alias mapping
  assert.deepEqual(canonicalSiteOrgIds("1pwr_zambia"), ["1pwr_zambia", "kuwala"]);
  assert.deepEqual(canonicalSiteOrgIds("1pwr_lesotho"), ["1pwr_lesotho"]);
  assert.deepEqual(canonicalSiteOrgIds("1pwr_benin"), ["1pwr_benin"]);
  assert.deepEqual(aliasOnlySiteOrgIds(), ["kuwala"]);

  // Doc selection: only alias orgs, active only, one per code, FM org wins.
  const docs = [
    { id: "a", data: { code: "LSK", organizationId: "1pwr_zambia", active: true } },
    { id: "b", data: { code: "HQZ", organizationId: "kuwala", active: true } },
    { id: "c", data: { code: "MAZ", organizationId: "1pwr_zambia" } },
    { id: "d", data: { code: "MAK", organizationId: "1pwr_lesotho", active: true } },
    { id: "e", data: { code: "OLD", organizationId: "kuwala", active: false } },
    { id: "f", data: { code: "HQ", organizationId: "kuwala", active: true } },
    { id: "g", data: { code: "HQ", organizationId: "1pwr_zambia", active: true } },
    { id: "h", data: { code: "NOORG", active: true } },
  ];
  const zm = selectCanonicalSiteDocsForOrg(docs, "1pwr_zambia").map((d) => d.id).sort();
  assert.deepEqual(zm, ["a", "b", "c", "g", "h"]); // h: no org = legacy accept-all
  const ls = selectCanonicalSiteDocsForOrg(docs, "1pwr_lesotho").map((d) => d.id).sort();
  assert.deepEqual(ls, ["d", "h"]); // unchanged legacy behaviour for LS

  // DB: seeded orgs (LS/ZM/BJ) exist after getDb()
  const db = getDb();
  assert.equal(usesLesothoLegacySiteCoords(db, "1pwr_lesotho"), true);
  assert.equal(usesLesothoLegacySiteCoords(db, "1pwr_zambia"), false);
  assert.equal(usesLesothoLegacySiteCoords(db, "1pwr_benin"), false);
  assert.equal(usesLesothoLegacySiteCoords(db, "kuwala"), false);

  // Route origins: Zambia starts at Lusaka HQ (LSK), Lesotho unchanged.
  const { getRouteOrigin } = await import("../src/lib/vehicle-request-fuel");
  assert.deepEqual(getRouteOrigin(db, "1pwr_zambia"), { lat: -15.4152423, lng: 28.3511183 });
  assert.deepEqual(getSiteCoordsByCode(db, "1pwr_zambia", "HQ"), { lat: -15.4152423, lng: 28.3511183 });
  assert.deepEqual(getRouteOrigin(db, "1pwr_lesotho"), { lat: -29.315, lng: 27.487 });

  // Legacy Lesotho coordinates are not used for Zambia (MAK is a Lesotho code).
  db.prepare(
    `INSERT INTO reference_data (id, organization_id, type, code, label, sort_order, active, meta)
     VALUES ('zm_mak', '1pwr_zambia', 'site', 'MAK', 'Not Lesotho', 0, 1, '{}')`
  ).run();
  // Lesotho MAK comes from seedDefaultData (no meta coordinates).
  assert.equal(getSiteCoordsByCode(db, "1pwr_zambia", "MAK"), null);
  assert.deepEqual(getSiteCoordsByCode(db, "1pwr_lesotho", "MAK"), { lat: -29.1929, lng: 27.5681 });

  // Orphan cleanup (the boot migration already ran on an empty table: 0 rows).
  const ins = db.prepare(
    `INSERT INTO reference_data (id, organization_id, type, code, label, sort_order, active, meta)
     VALUES (?, ?, 'site', ?, ?, 0, ?, '{}')`
  );
  ins.run("k1", "kuwala", "HQZ", "1PWR ZM Headquarters", 1);
  ins.run("k2", "kuwala", "MAK", "Ha Makebe", 1);
  ins.run("k3", "kuwala", "OLD", "Already inactive", 0);
  ins.run("z1", "1pwr_zambia", "PET", "Petauke", 1);
  db.prepare(
    `INSERT INTO reference_data (id, organization_id, type, code, label, sort_order, active, meta)
     VALUES ('kdept', 'kuwala', 'department', 'ADM', 'Admin', 0, 1, '{}')`
  ).run();

  const dry = deactivateOrphanAliasOrgSites(db, { apply: false });
  assert.equal(dry.candidates.length, 2);
  assert.equal(dry.deactivated, 0);
  assert.equal((db.prepare("SELECT active FROM reference_data WHERE id='k1'").get() as { active: number }).active, 1);

  const run1 = deactivateOrphanAliasOrgSites(db, { apply: true });
  assert.equal(run1.deactivated, 2);
  const run2 = deactivateOrphanAliasOrgSites(db, { apply: true });
  assert.equal(run2.deactivated, 0, "idempotent");
  const active = (id: string) =>
    (db.prepare("SELECT active FROM reference_data WHERE id = ?").get(id) as { active: number }).active;
  assert.equal(active("k1"), 0);
  assert.equal(active("k2"), 0);
  assert.equal(active("z1"), 1, "real Zambia org rows untouched");
  assert.equal(active("kdept"), 1, "non-site rows untouched");
  const rowsLeft = (db.prepare("SELECT COUNT(*) AS n FROM reference_data WHERE organization_id='kuwala'").get() as { n: number }).n;
  assert.equal(rowsLeft, 4, "never deletes");
  const audits = (db.prepare("SELECT COUNT(*) AS n FROM record_mutation_log WHERE reason = 'orphan_alias_org_site'").get() as { n: number }).n;
  assert.equal(audits, 2);

  console.log("zm site sync tests passed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
