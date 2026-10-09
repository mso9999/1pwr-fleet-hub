#!/usr/bin/env tsx
/**
 * Vehicle secondment: approve keeps the owner, scope helper, allocation same-org check,
 * return, P2/R3 migration (lib + CLI dry-run/apply), cost attribution switch, PR mirror payload.
 * Isolated temp DB. Run: npm run test:vehicle-secondment
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-secondment-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
delete process.env.FM_SECONDMENT_COST_ATTRIBUTION;

const LS = "1pwr_lesotho";
const ZM = "1pwr_zambia";
const BJ = "1pwr_benin";
const actor = { id: "u-exec", name: "Exec", role: "executive", department: "" };

async function main(): Promise<void> {
  const [{ getDb }, scope, secondment, cost, migration, prSync, readiness] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/vehicle-org-scope"),
    import("../src/lib/vehicle-secondment"),
    import("../src/lib/secondment-cost-attribution"),
    import("../src/lib/secondment-migration"),
    import("../src/lib/pr-vehicle-sync"),
    import("../src/lib/trip-readiness"),
  ]);
  const db = getDb();

  const countries = db.prepare("SELECT id, country FROM organizations").all() as Array<{ id: string; country: string }>;
  assert.equal(countries.find((o) => o.id === ZM)?.country, "ZM", "seeded orgs");

  const insertVehicle = db.prepare(
    `INSERT INTO vehicles (id, organization_id, code, make, model, license_plate, status, asset_class, is_synthetic)
     VALUES (?, ?, ?, 'Toyota', 'Hilux', 'T', 'operational', '4wd', 0)`
  );
  insertVehicle.run("veh_p2", LS, "P2");
  insertVehicle.run("veh_ls1", LS, "LS1");
  insertVehicle.run("veh_ls2", LS, "LS2");
  insertVehicle.run("veh_zm1", ZM, "ZM1");
  // R3: moved to ZM by the old approve route (organization_id = to_org), no secondment fields.
  insertVehicle.run("veh_r3", ZM, "R3");

  const insertRequest = db.prepare(
    `INSERT INTO vehicle_country_change_requests (
       id, vehicle_id, from_organization_id, to_organization_id, change_kind, reason,
       effective_date, expected_return_date, transfer_summary, status, requested_by_id, requested_by_name,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'test', ?, ?, 'test transfer', ?, 'u1', 'Requester', ?, ?)`
  );
  const getVehicle = (id: string) => db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as Record<string, unknown>;
  const getRequest = (id: string) =>
    db.prepare("SELECT * FROM vehicle_country_change_requests WHERE id = ?").get(id) as Record<string, unknown>;
  const mutations = (entityId: string) =>
    db
      .prepare("SELECT * FROM record_mutation_log WHERE entity_id = ? ORDER BY created_at, rowid")
      .all(entityId) as Array<Record<string, string>>;

  // ── 1. Approving a secondment keeps the owner and sets the four fields ──
  insertRequest.run(
    "req_p2", "veh_p2", LS, ZM, "secondment", "2026-09-01", "2026-12-31", "pending_executive",
    "2026-08-30T08:00:00Z", "2026-08-30T08:00:00Z"
  );
  db.transaction(() =>
    secondment.applyApprovedCountryChangeRequest(db, "req_p2", getRequest("req_p2"), actor, "u-exec", "Exec",
      "2026-09-01T09:00:00Z", { kind: "executive" })
  )();
  let p2 = getVehicle("veh_p2");
  assert.equal(p2.organization_id, LS, "owner unchanged by secondment");
  assert.equal(p2.seconded_to_org, ZM);
  assert.equal(p2.secondment_start, "2026-09-01");
  assert.equal(p2.secondment_expected_return, "2026-12-31");
  assert.equal(p2.secondment_request_id, "req_p2");
  assert.equal(getRequest("req_p2").status, "approved");
  assert.equal(getRequest("req_p2").executive_signed_by_id, "u-exec");
  const p2Log = mutations("veh_p2");
  assert.equal(p2Log.length, 1);
  assert.equal(p2Log[0].reason, "vehicle_country_change_request:req_p2");
  assert.equal(JSON.parse(p2Log[0].after_json).seconded_to_org, ZM);

  // permanent_transfer still moves organization_id
  insertRequest.run("req_ls2", "veh_ls2", LS, BJ, "permanent_transfer", "2026-09-01", "", "pending_executive",
    "2026-08-30T08:00:00Z", "2026-08-30T08:00:00Z");
  db.transaction(() =>
    secondment.applyApprovedCountryChangeRequest(db, "req_ls2", getRequest("req_ls2"), actor, "u-exec", "Exec",
      "2026-09-01T09:00:00Z", { kind: "executive" })
  )();
  assert.equal(getVehicle("veh_ls2").organization_id, BJ, "permanent transfer moves owner");
  assert.equal(getVehicle("veh_ls2").seconded_to_org, null);

  // ── 2. A seconded vehicle cannot be seconded again (or re-owned by correction) ──
  const again = secondment.countryChangeBlockedBySecondment(p2, "secondment", "ZM");
  assert.ok(again && /already seconded to ZM since 2026-09-01/.test(again), String(again));
  assert.ok(secondment.countryChangeBlockedBySecondment(p2, "data_correction", "ZM"));
  assert.equal(secondment.countryChangeBlockedBySecondment(p2, "permanent_transfer", "ZM"), null);
  assert.equal(secondment.countryChangeBlockedBySecondment(getVehicle("veh_ls1"), "secondment"), null);

  // Expected return optional; if given must be >= start
  assert.equal(secondment.validateSecondmentDates("2026-09-01", ""), null, "open-ended allowed");
  assert.equal(secondment.validateSecondmentDates("2026-09-01", "2026-09-01"), null);
  assert.ok(secondment.validateSecondmentDates("2026-09-01", "2026-08-31"));
  assert.ok(secondment.validateSecondmentDates("", ""));

  // ── 3. Scope helper: owner / borrower / other ──
  assert.equal(scope.vehicleVisibleToOrg(p2, LS), true);
  assert.equal(scope.vehicleVisibleToOrg(p2, ZM), true);
  assert.equal(scope.vehicleVisibleToOrg(p2, BJ), false);
  assert.equal(scope.vehicleOperableByOrg(p2, ZM), true);
  assert.equal(scope.vehicleOperableByOrg(p2, LS), false, "owner cannot allocate while seconded");
  assert.equal(scope.vehicleOperableByOrg(getVehicle("veh_ls1"), LS), true);
  assert.equal(scope.secondmentDirection(p2, LS), "out");
  assert.equal(scope.secondmentDirection(p2, ZM), "in");
  assert.equal(scope.secondmentDirection(p2, BJ), null);
  assert.equal(scope.isSecondmentOverdue(p2, "2026-12-31"), false);
  assert.equal(scope.isSecondmentOverdue(p2, "2027-01-01"), true);
  assert.equal(scope.isSecondmentOverdue({ seconded_to_org: ZM, secondment_expected_return: null }, "2099-01-01"), false);

  const idsWhere = (frag: { sql: string; params: string[] }) =>
    (db.prepare(`SELECT id FROM vehicles v WHERE ${frag.sql} AND COALESCE(v.is_synthetic,0)=0 ORDER BY id`)
      .all(...frag.params) as Array<{ id: string }>).map((r) => r.id);
  assert.deepEqual(idsWhere(scope.vehicleVisibleToOrgSql(LS, "v")), ["veh_ls1", "veh_p2"]);
  assert.deepEqual(idsWhere(scope.vehicleVisibleToOrgSql(ZM, "v")), ["veh_p2", "veh_r3", "veh_zm1"]);
  assert.deepEqual(idsWhere(scope.vehicleOperableByOrgSql(LS, "v")), ["veh_ls1"], "reserve candidates for owner exclude P2");
  assert.deepEqual(idsWhere(scope.vehicleOperableByOrgSql(ZM, "v")), ["veh_p2", "veh_r3", "veh_zm1"]);
  assert.deepEqual(idsWhere(scope.vehicleOperableByOrgSql(BJ, "v")), ["veh_ls2"]);

  // ── 4. Reserve / assign same-org check ──
  assert.equal(scope.vehicleAllocationOrgError(p2, ZM), null, "borrower may reserve seconded vehicle");
  const ownerErr = scope.vehicleAllocationOrgError(p2, LS, "ZM");
  assert.ok(ownerErr && /seconded to ZM/.test(ownerErr), String(ownerErr));
  assert.equal(scope.vehicleAllocationOrgError(getVehicle("veh_zm1"), LS), "Vehicle belongs to a different organization.");

  // Trip readiness uses the same check
  const gateFor = (orgId: string) =>
    readiness
      .evaluateTripReadiness(db, { organizationId: orgId, vehicleId: "veh_p2", missionProfile: "local", skipDriverChecklist: true })
      .gates.find((g) => g.id === "vehicle_org");
  assert.equal(gateFor(ZM), undefined, "borrower passes the org gate");
  assert.equal(gateFor(LS)?.status, "blocked", "owner blocked while seconded");

  // ── 5. Cost attribution switch ──
  assert.equal(cost.secondmentCostAttribution({}), "user", "default is the using org");
  assert.equal(cost.secondmentCostAttribution({ FM_SECONDMENT_COST_ATTRIBUTION: "owner" }), "owner");
  assert.equal(cost.secondmentCostAttribution({ FM_SECONDMENT_COST_ATTRIBUTION: "OWNER " }), "owner");
  assert.equal(cost.secondmentCostAttribution({ FM_SECONDMENT_COST_ATTRIBUTION: "nonsense" }), "user");
  assert.equal(cost.costAttributionOrgId(p2, "user"), ZM);
  assert.equal(cost.costAttributionOrgId(p2, "owner"), LS);
  assert.equal(cost.costAttributionOrgId(getVehicle("veh_ls1"), "user"), LS);
  assert.deepEqual(idsWhere(cost.vehicleCostScopeSql(ZM, "v", "user")), ["veh_p2", "veh_r3", "veh_zm1"]);
  assert.deepEqual(idsWhere(cost.vehicleCostScopeSql(ZM, "v", "owner")), ["veh_r3", "veh_zm1"]);
  assert.deepEqual(idsWhere(cost.vehicleCostScopeSql(LS, "v", "owner")), ["veh_ls1", "veh_p2"]);
  assert.deepEqual(idsWhere(cost.vehicleCostScopeSql(LS, "v", "user")), ["veh_ls1"]);

  // ── 6. PR mirror payload ──
  const prSeconded = prSync.mapFmVehicleToPrFirestore(prSync.fmVehicleRowFromDb(p2));
  assert.equal(prSeconded.organizationId, LS, "PR organizationId stays the owner");
  assert.deepEqual(prSeconded.organization, { id: LS, name: "1PWR Lesotho" });
  assert.equal(prSeconded.secondedToOrganizationId, ZM);
  assert.deepEqual(prSeconded.secondedToOrganization, { id: ZM, name: "1PWR Zambia" });
  assert.equal(prSeconded.secondmentStart, "2026-09-01");
  assert.equal(prSeconded.secondmentExpectedReturn, "2026-12-31");
  const prPlain = prSync.mapFmVehicleToPrFirestore(prSync.fmVehicleRowFromDb(getVehicle("veh_ls1")));
  assert.equal(prPlain.secondedToOrganizationId, null, "explicit null clears a finished secondment on merge");
  assert.equal(prPlain.secondedToOrganization, null);
  assert.equal(prPlain.secondmentStart, null);
  assert.equal(prPlain.secondmentExpectedReturn, null);

  // ── 7. Return clears the fields and logs ──
  db.prepare(
    `INSERT INTO missions (id, organization_id, title, destination, departure_date, return_date)
     VALUES ('m_zm', ?, 'ZM site run', 'KIT', '2099-01-01', '2099-01-02')`
  ).run(ZM);
  db.prepare(
    `INSERT INTO vehicle_reservations (id, organization_id, vehicle_id, mission_id, start_date, end_date, status)
     VALUES ('res_zm', ?, 'veh_p2', 'm_zm', '2099-01-01', '2099-01-02', 'active')`
  ).run(ZM);
  const ret = secondment.returnSecondment(db, { vehicleId: "veh_p2", actor, note: "back from Kitwe", now: "2026-10-09T10:00:00Z" });
  assert.equal(ret.ok, true);
  if (ret.ok) {
    assert.equal(ret.before.seconded_to_org, ZM);
    assert.equal(ret.borrowerReservationsAfterReturn, 1, "borrower's future reservation reported");
  }
  p2 = getVehicle("veh_p2");
  assert.equal(p2.organization_id, LS);
  for (const col of ["seconded_to_org", "secondment_start", "secondment_expected_return", "secondment_request_id"]) {
    assert.equal(p2[col], null, `${col} cleared`);
  }
  const retLog = mutations("veh_p2").at(-1)!;
  assert.equal(retLog.action, "secondment_return");
  assert.equal(retLog.reason, "back from Kitwe");
  assert.equal(JSON.parse(retLog.before_json).secondment_request_id, "req_p2");
  const again2 = secondment.returnSecondment(db, { vehicleId: "veh_p2", actor, now: "2026-10-09T11:00:00Z" });
  assert.equal(again2.ok, false);
  if (!again2.ok) assert.equal(again2.status, 400);
  assert.equal(scope.vehicleOperableByOrg(p2, LS), true, "owner may allocate again after return");

  // ── 8. Migration (lib) ──
  insertRequest.run("req_r3", "veh_r3", LS, ZM, "secondment", "2026-07-15", "", "approved",
    "2026-07-10T08:00:00Z", "2026-07-15T08:00:00Z");
  const plan = migration.planSecondmentMigration(db);
  assert.deepEqual(plan.map((i) => [i.code, i.action]), [["R3", "convert"]], "default scope: P2/R3 in ZM");
  assert.deepEqual(plan[0].after, {
    organization_id: LS,
    seconded_to_org: ZM,
    secondment_start: "2026-07-15",
    secondment_expected_return: null,
    secondment_request_id: "req_r3",
  });
  const planAll = migration.planSecondmentMigration(db, { allApprovedSecondments: true });
  const p2Plan = planAll.find((i) => i.code === "P2");
  assert.equal(p2Plan?.action, "skip", "P2 was a proper secondment, now returned: untouched");
  // A later permanent transfer means the move was real.
  insertVehicle.run("veh_x9", ZM, "X9");
  insertRequest.run("req_x9_s", "veh_x9", LS, ZM, "secondment", "2026-05-01", "2026-06-01", "approved",
    "2026-04-20T08:00:00Z", "2026-05-01T08:00:00Z");
  insertRequest.run("req_x9_p", "veh_x9", LS, ZM, "permanent_transfer", "2026-06-01", "", "approved",
    "2026-05-20T08:00:00Z", "2026-06-01T08:00:00Z");
  const x9 = migration.planSecondmentMigration(db, { allApprovedSecondments: true }).find((i) => i.code === "X9");
  assert.equal(x9?.action, "skip");
  assert.match(x9!.note, /superseded by later approved permanent_transfer/);

  // ── 9. Migration CLI: dry-run changes nothing, --apply converts, re-run is idempotent ──
  const cliDb = path.join(tmpDir, "cli.db");
  db.exec(`VACUUM INTO '${cliDb.replace(/'/g, "''")}'`);
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const runCli = (...args: string[]) => {
    const r = spawnSync(tsxBin, ["scripts/migrate-secondment-p2-r3.ts", ...args], {
      env: { ...process.env, DB_PATH: cliDb },
      encoding: "utf8",
    });
    assert.equal(r.status, 0, `CLI ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
    return r.stdout;
  };
  const cliRow = () => {
    const c = new Database(cliDb, { readonly: true });
    const row = c.prepare("SELECT * FROM vehicles WHERE id = 'veh_r3'").get() as Record<string, unknown>;
    const logs = (c.prepare(
      "SELECT COUNT(*) AS n FROM record_mutation_log WHERE entity_id = 'veh_r3' AND actor_id = ?"
    ).get(migration.SECONDMENT_MIGRATION_ACTOR.id) as { n: number }).n;
    c.close();
    return { row, logs };
  };

  const dry = runCli();
  assert.match(dry, /Mode: dry-run/);
  assert.match(dry, /R3 \(veh_r3\) — convert/);
  assert.match(dry, /1 vehicle\(s\) would be converted/);
  assert.equal(cliRow().row.organization_id, ZM, "dry-run writes nothing");
  assert.equal(cliRow().logs, 0);

  const applied = runCli("--apply");
  assert.match(applied, /Applied: 1 vehicle\(s\) converted/);
  assert.match(applied, /PR mirror NOT updated/);
  let after = cliRow();
  assert.equal(after.row.organization_id, LS);
  assert.equal(after.row.seconded_to_org, ZM);
  assert.equal(after.row.secondment_start, "2026-07-15");
  assert.equal(after.row.secondment_expected_return, null);
  assert.equal(after.row.secondment_request_id, "req_r3");
  assert.equal(after.logs, 1);

  const rerun = runCli("--apply");
  assert.match(rerun, /R3 \(veh_r3\) — already_migrated/);
  assert.match(rerun, /Applied: 0 vehicle\(s\) converted/);
  after = cliRow();
  assert.equal(after.row.organization_id, LS);
  assert.equal(after.logs, 1, "idempotent: no second log row");

  // Same via the lib on the main DB, then the migrated vehicle is a normal secondment.
  assert.equal(migration.applySecondmentMigration(db, plan, migration.SECONDMENT_MIGRATION_ACTOR, "2026-10-09T12:00:00Z"), 1);
  assert.equal(migration.applySecondmentMigration(db, plan), 0, "guarded UPDATE: second apply is a no-op");
  const r3 = getVehicle("veh_r3");
  assert.equal(scope.secondmentDirection(r3, LS), "out");
  assert.equal(scope.vehicleOperableByOrg(r3, ZM), true);
  assert.equal(prSync.mapFmVehicleToPrFirestore(prSync.fmVehicleRowFromDb(r3)).secondmentExpectedReturn, null);

  console.log("test-vehicle-secondment: all assertions passed");
}

main()
  .then(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  })
  .catch((err) => {
    console.error(err);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  });
