/**
 * Country-scoped fleet lead: one person can be manager AND fleet lead, and
 * fleet-lead powers stop at the user's own country.
 *
 * Run with: npx tsx scripts/test-country-fleet-lead.ts
 * Isolated temp SQLite DB + injected HR approval cache; no network, no prod DB.
 * Also runs scripts/migrate-country-fleet-lead.ts (dry-run, then --apply twice)
 * against the temp DB as a child process.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-country-fleet-lead-"));
const dbPath = path.join(tmpDir, "test.db");
process.env.DB_PATH = dbPath;

import type { HrToolsetApproval } from "../src/lib/hr-approval-roles";
import type { HrDirectoryEmployee } from "../src/lib/hr-directory-client";

type Emp = HrDirectoryEmployee & { toolset_approvals?: HrToolsetApproval[] };
function emp(email: string, approvals: HrToolsetApproval[]): Emp {
  return {
    id: 0, employee_id: null, name: email, email, role: "user", type: "user", country: null, department: null,
    primary_deployment: null, current_position_title: null, employment_start_date: null, phone: null,
    headshot: null, status: "active", last_updated_at: null, toolset_approvals: approvals,
  };
}
const grant = (role: string, cc: string | null): HrToolsetApproval => ({
  toolset: "fm", approval_role: role, scope_country_code: cc, scope_organization_id: null,
});

const ZM = "1pwr_zambia";
const LS = "1pwr_lesotho";
const ROOT = path.join(__dirname, "..");

async function main(): Promise<void> {
  const { getDb } = await import("../src/lib/db");
  const v = await import("../src/lib/vehicle-check-approvers");
  const scope = await import("../src/lib/fleet-lead-scope");
  const { applyHrFleetRolePlan } = await import("../src/lib/hr-fleet-role-sync");
  const { clearHrApprovalCache, setHrApprovalCacheForTest } = await import("../src/lib/hr-approval-roles");
  const db = getDb();

  for (const [id, code, cc] of [[ZM, "1PWR-ZM", "ZM"], [LS, "1PWR-LS", "LS"]]) {
    db.prepare(
      `INSERT OR IGNORE INTO organizations (id, name, code, country, currency, timezone_offset, active)
       VALUES (?, ?, ?, ?, 'XXX', 2, 1)`,
    ).run(id, `Test ${cc}`, code, cc);
  }
  assert.equal((db.prepare("SELECT country FROM organizations WHERE id = ?").get(ZM) as { country: string }).country, "ZM");
  assert.equal((db.prepare("SELECT country FROM organizations WHERE id = ?").get(LS) as { country: string }).country, "LS");

  // Table exists via the app migration (safeMigrate migrateFleetLeadScopes).
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_fleet_lead_scopes'").get());

  const addUser = (id: string, email: string, role: string, org: string) =>
    db.prepare("INSERT INTO users (id, email, name, role, organization_id) VALUES (?, ?, ?, ?, ?)").run(id, email, id, role, org);
  addUser("u-eduardo", "eduardo@1pwrafrica.com", "manager", ZM);
  addUser("u-kelebone", "kelebone@1pwrafrica.com", "fleet_lead", LS);
  addUser("u-super", "super@example.com", "superadmin", LS);
  addUser("u-alloc", "zm.allocator@example.com", "user", LS);
  addUser("u-lsmgr", "ls.manager@example.com", "manager", LS);
  addUser("u-scoped", "scoped.user@example.com", "user", LS);

  setHrApprovalCacheForTest(new Map<string, Emp>([
    ["eduardo@1pwrafrica.com", emp("eduardo@1pwrafrica.com", [])],
    ["kelebone@1pwrafrica.com", emp("kelebone@1pwrafrica.com", [])],
    ["super@example.com", emp("super@example.com", [])],
    ["zm.allocator@example.com", emp("zm.allocator@example.com", [grant("vehicle_allocator", "ZM")])],
    ["ls.manager@example.com", emp("ls.manager@example.com", [])],
    ["scoped.user@example.com", emp("scoped.user@example.com", [])],
    ["plain@example.com", emp("plain@example.com", [])],
  ]));

  // Caller as getVerifiedFleetUser returns it (role + home org from users).
  const caller = (email: string) => {
    const row = scope.findUserByEmail(db, email);
    assert.ok(row, email);
    return { id: row.id, email: row.email, role: row.role, organizationId: row.organization_id, name: row.id, department: "" };
  };
  const allocate = (org: string, email: string) => v.canAllocateFleetVehicleForOrg(db, org, email, caller(email).role);
  const reserve = (org: string, email: string) => v.canReserveMissionVehicleForOrg(db, org, caller(email));
  const skip = (org: string, email: string) => v.canOverrideInspectionGate(db, org, caller(email));
  const approve = (org: string, email: string) => v.canApproveMissionRequests(db, org, email, caller(email).role);
  const manage = (org: string, email: string) => scope.isFleetManagementForOrg(db, org, caller(email));
  const overlap = (email: string) => v.canOverrideReservationOverlap(caller(email).role);

  assert.equal(scope.grantFleetLeadScope(db, "u-eduardo", ZM, "test"), true);
  assert.equal(scope.grantFleetLeadScope(db, "u-eduardo", ZM, "test"), false, "grant is idempotent");
  assert.equal(scope.grantFleetLeadScope(db, "u-scoped", ZM, "test"), true);

  // 1. Manager + ZM fleet-lead scope (Eduardo after migration).
  const ed = "eduardo@1pwrafrica.com";
  assert.equal(await allocate(ZM, ed), true, "manager+ZM scope allocates in ZM");
  assert.equal(await allocate(LS, ed), false, "…but not in LS");
  assert.equal(await reserve(ZM, ed), true);
  assert.equal(await reserve(LS, ed), false);
  assert.equal(await approve(ZM, ed), true, "manager keeps mission approval with a fleet-lead scope");
  assert.equal(await skip(ZM, ed), true, "inspection override in own country");
  assert.equal(await skip(LS, ed), false, "no inspection override in another country");
  assert.equal(overlap(ed), true, "manager still overrides overlaps (unchanged)");
  assert.equal(manage(ZM, ed), true);
  assert.equal(await v.canArbitrateMissionCapacity(db, ZM, ed, "manager"), true);
  assert.equal(await v.canOverrideDriverApproval(db, ZM, caller(ed)), true);
  assert.equal(await v.canOverrideDriverApproval(db, LS, caller(ed)), false);

  // 2. Legacy role fleet_lead (Kelebone, LS): own country only, never approves.
  const kb = "kelebone@1pwrafrica.com";
  assert.equal(await allocate(LS, kb), true, "legacy fleet_lead allocates in own org");
  assert.equal(await allocate(ZM, kb), false, "legacy fleet_lead does not allocate in ZM");
  assert.equal(await reserve(ZM, kb), false);
  assert.equal(await approve(LS, kb), false, "literal fleet_lead role is still excluded from mission approval");
  assert.equal(await approve(ZM, kb), false);
  assert.equal(await skip(LS, kb), true);
  assert.equal(await skip(ZM, kb), false, "inspection override follows the country scope");
  assert.equal(overlap(kb), false, "fleet_lead cannot override overlaps (unchanged)");
  assert.equal(manage(LS, kb), true);
  assert.equal(manage(ZM, kb), false, "fleet_lead edits only its own org's fleet records");
  assert.equal(await v.canApproveVehicleCheckExceptions(db, LS, kb, "fleet_lead"), true);
  assert.equal(await v.canApproveVehicleCheckExceptions(db, ZM, kb, "fleet_lead"), false);
  assert.equal(await v.canArbitrateMissionCapacity(db, LS, kb, "fleet_lead"), false);
  // A fleet_lead granted a scope for another country gains it there, but still cannot approve.
  scope.grantFleetLeadScope(db, "u-kelebone", ZM, "test");
  assert.equal(await allocate(ZM, kb), true);
  assert.equal(await approve(ZM, kb), false);
  assert.equal(scope.revokeFleetLeadScope(db, "u-kelebone", ZM), true);
  assert.equal(await allocate(ZM, kb), false);

  // 3. Superadmin: global.
  const sa = "super@example.com";
  for (const org of [ZM, LS]) {
    assert.equal(await allocate(org, sa), true);
    assert.equal(await reserve(org, sa), true);
    assert.equal(await skip(org, sa), true);
    assert.equal(await approve(org, sa), true);
    assert.equal(manage(org, sa), true);
  }

  // 4. HR fm:vehicle_allocator (PR #4) still works, country-scoped; not edit authority.
  const al = "zm.allocator@example.com";
  assert.equal(await allocate(ZM, al), true);
  assert.equal(await allocate(LS, al), false);
  assert.equal(await skip(ZM, al), true, "HR allocator may skip the inspection in its country");
  assert.equal(await skip(LS, al), false);
  assert.equal(await approve(ZM, al), false);
  assert.equal(manage(ZM, al), false, "HR allocator grant is not fleet-management edit authority");

  // 5. Manager without a scope (hotfix 85d11a0): reserves + overrides in own org only, never allocates elsewhere.
  const lm = "ls.manager@example.com";
  assert.equal(await allocate(LS, lm), false, "manager role alone is not fleet lead");
  assert.equal(await reserve(LS, lm), true);
  assert.equal(await skip(LS, lm), true);
  assert.equal(await skip(ZM, lm), false);
  assert.equal(await reserve(ZM, lm), false);

  // 6. Scope-only user (role user, home LS, scope ZM): fleet lead in ZM, no approval.
  const su = "scoped.user@example.com";
  assert.equal(await allocate(ZM, su), true);
  assert.equal(await allocate(LS, su), false);
  assert.equal(await skip(ZM, su), true);
  assert.equal(manage(ZM, su), true);
  assert.equal(manage(LS, su), false);
  assert.equal(await approve(ZM, su), false, "fleet-lead scope does not confer mission approval");

  // 7. Hotfix expectations (test-inspection-override) with a caller that has no users row.
  const bare = (role: string, organizationId: string) => ({ email: "plain@example.com", role, organizationId });
  assert.equal(await v.canOverrideInspectionGate(db, ZM, bare("fleet_lead", ZM)), true);
  assert.equal(await v.canOverrideInspectionGate(db, ZM, bare("fleet_lead", LS)), false);
  assert.equal(await v.canOverrideInspectionGate(db, ZM, bare("manager", ZM)), true);
  assert.equal(await v.canOverrideInspectionGate(db, ZM, bare("manager", LS)), false);
  assert.equal(await v.canOverrideInspectionGate(db, ZM, bare("admin", ZM)), false);
  assert.equal(await v.canOverrideInspectionGate(db, ZM, bare("superadmin", LS)), true);

  // 8. Revoking the scope removes fleet lead but not the manager's approval.
  assert.equal(scope.revokeFleetLeadScope(db, "u-eduardo", ZM), true);
  assert.equal(scope.revokeFleetLeadScope(db, "u-eduardo", ZM), false);
  assert.equal(await allocate(ZM, ed), false);
  assert.equal(await approve(ZM, ed), true);
  assert.equal(await skip(ZM, ed), true, "manager of ZM keeps the inspection override (hotfix)");
  scope.grantFleetLeadScope(db, "u-eduardo", ZM, "test");

  // 9. HR fleet-role sync does not wipe scope rows, and does not demote a manager to fleet_lead.
  applyHrFleetRolePlan(db, [
    { email: ed, title: "Fleet Lead", department: "Fleet" },
    { email: kb, title: "Fleet Lead", department: "Fleet" },
  ]);
  assert.equal(caller(ed).role, "manager");
  assert.equal(caller(kb).role, "fleet_lead");
  assert.deepEqual(scope.listFleetLeadScopes(db, ZM).map((r) => r.email).sort(), [ed, su]);

  // 10. Wiring guards: routes/UI use the org-scoped helpers.
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
  const me = read("src/app/api/me/mission-request-can-approve/route.ts");
  assert.match(me, /canSkipInspection = await canOverrideInspectionGate\(db, org, user\)/);
  assert.match(me, /canFullEdit = isFleetManagementForOrg\(db, org, user\)/);
  assert.match(me, /isFleetLead = await canAllocateFleetVehicleForOrg\(db, org, user\.email, user\.role\)/);
  const checkout = read("src/app/trips/checkout-form.tsx");
  assert.match(checkout, /const canFleetHold = serverFleetLead \?\?/, "checkout hold uses the server fleet-lead flag");
  const reserveRoute = read("src/app/api/missions/[id]/reserve-vehicle/route.ts");
  assert.match(reserveRoute, /canOverrideInspectionGate\(db, orgId, user\)/);
  assert.doesNotMatch(reserveRoute, /canAllocateFleetVehicle\(user\.role\)/);
  const page = read("src/app/vehicle-requests/page.tsx");
  const row = page.slice(page.indexOf("function FleetMissionReserveRow("), page.indexOf("export default function VehicleRequestsPage"));
  assert.match(row, /canOverrideInspection/, "reserve row uses the server flag");
  assert.doesNotMatch(row, /user\??\.role/, "reserve row does not derive the override from user.role");
  assert.equal("canAllocateFleetVehicle" in v, false, "role-only global allocator helper is gone");
  assert.equal("canFullyManageVehicleRequests" in v, false);

  clearHrApprovalCache();

  // 11. Migration script: dry-run writes nothing; --apply is correct and idempotent.
  db.prepare("DELETE FROM user_fleet_lead_scopes").run();
  db.prepare("UPDATE users SET role = 'fleet_lead' WHERE id = 'u-eduardo'").run(); // production stop-gap
  db.pragma("wal_checkpoint(TRUNCATE)");
  const logCount = () =>
    (db.prepare("SELECT COUNT(*) AS n FROM record_mutation_log WHERE reason = 'country_fleet_lead_migration'").get() as { n: number }).n;
  const run = (...args: string[]) =>
    execFileSync(path.join(ROOT, "node_modules/.bin/tsx"), [path.join(ROOT, "scripts/migrate-country-fleet-lead.ts"), ...args], {
      env: { ...process.env, DB_PATH: dbPath },
      encoding: "utf8",
    });

  const dry = run();
  assert.match(dry, /DRY-RUN complete \(3 change\(s\) planned\)/);
  assert.match(dry, /ROLE {2}eduardo@1pwrafrica\.com: fleet_lead → manager/);
  assert.equal(caller(ed).role, "fleet_lead", "dry-run does not write");
  assert.equal(scope.listFleetLeadScopes(db).length, 0);
  assert.equal(logCount(), 0);

  const applied = run("--apply");
  assert.match(applied, /Applied 3 change\(s\)/);
  assert.match(applied, /Before:[\s\S]*eduardo@1pwrafrica\.com: role=fleet_lead[\s\S]*After:[\s\S]*eduardo@1pwrafrica\.com: role=manager org=1pwr_zambia fleet_lead_scopes=\[1pwr_zambia\]/);
  assert.equal(caller(ed).role, "manager");
  assert.equal(caller(kb).role, "fleet_lead", "Kelebone keeps role fleet_lead");
  assert.deepEqual(
    scope.listFleetLeadScopes(db).map((r) => `${r.email}:${r.organization_id}`).sort(),
    [`${ed}:${ZM}`, `${kb}:${LS}`],
  );
  assert.equal(logCount(), 3, "one role change + two scope grants logged");
  const roleLog = db
    .prepare("SELECT before_json, after_json FROM record_mutation_log WHERE reason = 'country_fleet_lead_migration' AND action = 'update'")
    .get() as { before_json: string; after_json: string };
  assert.deepEqual(JSON.parse(roleLog.before_json), { role: "fleet_lead" });
  assert.deepEqual(JSON.parse(roleLog.after_json), { role: "manager" });

  setHrApprovalCacheForTest(new Map<string, Emp>([[ed, emp(ed, [])], [kb, emp(kb, [])]]));
  assert.equal(await approve(ZM, ed), true, "post-migration: Eduardo approves ZM missions again");
  assert.equal(await allocate(ZM, ed), true, "post-migration: Eduardo allocates in ZM");
  assert.equal(await allocate(LS, ed), false);
  assert.equal(await allocate(LS, kb), true);
  assert.equal(await allocate(ZM, kb), false);
  clearHrApprovalCache();

  const again = run("--apply");
  assert.match(again, /Applied 0 change\(s\)/);
  assert.equal(logCount(), 3, "re-run is a no-op");

  console.log("country fleet lead tests passed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
