/**
 * Outside-50-km inspection-gate override (hotfix 2026-10-09).
 *
 * Run with: npx tsx scripts/test-inspection-override.ts
 * Isolated temp SQLite DB + injected HR approval cache; no network, no prod DB.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-insp-override-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");

import type { HrToolsetApproval } from "../src/lib/hr-approval-roles";
import type { HrDirectoryEmployee } from "../src/lib/hr-directory-client";

type Emp = HrDirectoryEmployee & { toolset_approvals?: HrToolsetApproval[] };
function emp(email: string, role: string, approvals: HrToolsetApproval[]): Emp {
  return {
    id: 0, employee_id: null, name: email, email, role, type: "user", country: null, department: null,
    primary_deployment: null, current_position_title: null, employment_start_date: null, phone: null,
    headshot: null, status: "active", last_updated_at: null, toolset_approvals: approvals,
  };
}
const grant = (role: string, cc: string | null): HrToolsetApproval => ({
  toolset: "fm", approval_role: role, scope_country_code: cc, scope_organization_id: null,
});

async function main(): Promise<void> {
  const { getDb } = await import("../src/lib/db");
  const { canOverrideInspectionGate, canReserveMissionVehicleForOrg } = await import("../src/lib/vehicle-check-approvers");
  const { clearHrApprovalCache, setHrApprovalCacheForTest } = await import("../src/lib/hr-approval-roles");
  const { reserveVehicleBody } = await import("../src/lib/reserve-vehicle-body");
  const db = getDb();
  for (const [id, code, cc] of [["test_zm", "T-ZM", "ZM"], ["test_ls", "T-LS", "LS"]]) {
    db.prepare(
      `INSERT OR IGNORE INTO organizations (id, name, code, country, currency, timezone_offset, active)
       VALUES (?, ?, ?, ?, 'XXX', 2, 1)`,
    ).run(id, `Test ${cc}`, code, cc);
  }
  setHrApprovalCacheForTest(new Map<string, Emp>([
    ["admin.zmalloc@example.com", emp("admin.zmalloc@example.com", "user", [grant("vehicle_allocator", "ZM")])],
    ["plain@example.com", emp("plain@example.com", "user", [])],
  ]));

  const u = (email: string, role: string, organizationId: string) => ({ email, role, organizationId });

  // Manager of the mission org: may reserve AND override (the Eduardo case).
  assert.equal(await canReserveMissionVehicleForOrg(db, "test_zm", u("plain@example.com", "manager", "test_zm")), true);
  assert.equal(await canOverrideInspectionGate(db, "test_zm", u("plain@example.com", "manager", "test_zm")), true);
  // Manager of another org: neither.
  assert.equal(await canReserveMissionVehicleForOrg(db, "test_zm", u("plain@example.com", "manager", "test_ls")), false);
  assert.equal(await canOverrideInspectionGate(db, "test_zm", u("plain@example.com", "manager", "test_ls")), false);
  // Fleet lead: override scoped to own org.
  assert.equal(await canOverrideInspectionGate(db, "test_zm", u("plain@example.com", "fleet_lead", "test_zm")), true);
  assert.equal(await canOverrideInspectionGate(db, "test_zm", u("plain@example.com", "fleet_lead", "test_ls")), false);
  // Superadmin: global.
  assert.equal(await canOverrideInspectionGate(db, "test_zm", u("plain@example.com", "superadmin", "test_ls")), true);
  // Admin with HR ZM vehicle_allocator grant (the Matt case): reserve + override in ZM only.
  assert.equal(await canReserveMissionVehicleForOrg(db, "test_zm", u("admin.zmalloc@example.com", "admin", "test_ls")), true);
  assert.equal(await canOverrideInspectionGate(db, "test_zm", u("admin.zmalloc@example.com", "admin", "test_ls")), true);
  assert.equal(await canOverrideInspectionGate(db, "test_ls", u("admin.zmalloc@example.com", "admin", "test_ls")), false);
  // Plain admin / user without grant: no override.
  assert.equal(await canOverrideInspectionGate(db, "test_zm", u("plain@example.com", "admin", "test_zm")), false);
  assert.equal(await canOverrideInspectionGate(db, "test_zm", u("plain@example.com", "user", "test_zm")), false);
  assert.equal(await canReserveMissionVehicleForOrg(db, "test_zm", u("plain@example.com", "admin", "test_zm")), false);

  // Card request body: reason sent only when 8+ chars (trimmed).
  assert.deepEqual(reserveVehicleBody("v1", ""), { vehicleId: "v1" });
  assert.deepEqual(reserveVehicleBody("v1", "  short "), { vehicleId: "v1" });
  assert.deepEqual(
    reserveVehicleBody("v1", "  Fire extinguisher to be replaced before departure "),
    { vehicleId: "v1", overrideReason: "Fire extinguisher to be replaced before departure" },
  );

  // Route source wiring guard: the gate uses the new org-scoped check, not role-only.
  const route = fs.readFileSync(path.join(__dirname, "../src/app/api/missions/[id]/reserve-vehicle/route.ts"), "utf8");
  assert.match(route, /canOverrideInspectionGate\(db, orgId, user\)/);
  assert.match(route, /canReserveMissionVehicleForOrg\(db, orgId, user\)/);
  assert.doesNotMatch(route, /canAllocateFleetVehicle\(user\.role\)/);
  const page = fs.readFileSync(path.join(__dirname, "../src/app/vehicle-requests/page.tsx"), "utf8");
  assert.match(page, /body: JSON\.stringify\(reserveVehicleBody\(vehicleId, reason\)\)/);

  clearHrApprovalCache();
  console.log("inspection override tests passed");
}

main().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
