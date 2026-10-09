/**
 * Driver-approval override (hotfix 2026-10-09, ZM has no approved drivers yet).
 *
 * Run with: npx tsx scripts/test-driver-override.ts
 * Isolated temp SQLite DB + injected HR approval cache; no network, no prod DB.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-driver-override-"));
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
  const { canOverrideDriverApproval } = await import("../src/lib/vehicle-check-approvers");
  const { clearHrApprovalCache, setHrApprovalCacheForTest } = await import("../src/lib/hr-approval-roles");
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
  const can = (org: string, user: ReturnType<typeof u>) => canOverrideDriverApproval(db, org, user);

  assert.equal(await can("test_zm", u("plain@example.com", "manager", "test_zm")), true);
  assert.equal(await can("test_zm", u("plain@example.com", "fleet_lead", "test_zm")), true);
  assert.equal(await can("test_zm", u("plain@example.com", "manager", "test_ls")), false);
  assert.equal(await can("test_zm", u("plain@example.com", "fleet_lead", "test_ls")), false);
  assert.equal(await can("test_zm", u("plain@example.com", "superadmin", "test_ls")), true);
  assert.equal(await can("test_zm", u("admin.zmalloc@example.com", "admin", "test_ls")), true);
  assert.equal(await can("test_ls", u("admin.zmalloc@example.com", "admin", "test_ls")), false);
  assert.equal(await can("test_zm", u("plain@example.com", "user", "test_zm")), false);
  assert.equal(await can("test_zm", u("plain@example.com", "driver", "test_zm")), false);

  // Route wiring guards.
  const post = fs.readFileSync(path.join(__dirname, "../src/app/api/vehicle-requests/route.ts"), "utf8");
  assert.match(post, /canOverrideDriverApproval\(db, orgId, user\)/);
  assert.match(post, /action: "driver_approval_override"/);
  assert.match(post, /driverOverrideName/);
  assert.match(post, /overrideReasonRaw\.length >= 8/);
  const patch = fs.readFileSync(path.join(__dirname, "../src/app/api/vehicle-requests/[id]/route.ts"), "utf8");
  assert.match(patch, /canOverrideDriverApproval\(db, orgId, user\)/);
  assert.match(patch, /action: "driver_approval_override"/);
  const me = fs.readFileSync(path.join(__dirname, "../src/app/api/me/mission-request-can-approve/route.ts"), "utf8");
  assert.match(me, /canOverrideDriver/);
  const page = fs.readFileSync(path.join(__dirname, "../src/app/vehicle-requests/page.tsx"), "utf8");
  assert.match(page, /payload\.driverOverrideName = driverOverrideName\.trim\(\)/);
  assert.match(page, /\/8 characters/);

  clearHrApprovalCache();
  console.log("driver override tests passed");
}

main().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
