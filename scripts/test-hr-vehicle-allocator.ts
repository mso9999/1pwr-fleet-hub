/**
 * HR-canonical fm:vehicle_allocator gate for vehicle allocation.
 *
 * Run with: npx tsx scripts/test-hr-vehicle-allocator.ts
 *
 * Uses an isolated temp-file SQLite DB (DB_PATH must be set before importing
 * src/lib/db) and an injected HR approval cache, so no network or prod DB.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-vehicle-allocator-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");

import type { HrToolsetApproval } from "../src/lib/hr-approval-roles";
import type { HrDirectoryEmployee } from "../src/lib/hr-directory-client";

// Static imports are hoisted above the DB_PATH assignment, so load the
// DB-dependent modules dynamically inside main() instead.

type Emp = HrDirectoryEmployee & { toolset_approvals?: HrToolsetApproval[] };

function emp(email: string, role: string, approvals: HrToolsetApproval[]): Emp {
  return {
    id: 0,
    employee_id: null,
    name: email,
    email,
    role,
    type: "user",
    country: null,
    department: null,
    primary_deployment: null,
    current_position_title: null,
    employment_start_date: null,
    phone: null,
    headshot: null,
    status: "active",
    last_updated_at: null,
    toolset_approvals: approvals,
  };
}

function grant(role: string, country: string | null): HrToolsetApproval {
  return { toolset: "fm", approval_role: role, scope_country_code: country, scope_organization_id: null };
}

async function main(): Promise<void> {
  const { getDb } = await import("../src/lib/db");
  const { canAllocateFleetVehicle, canAllocateFleetVehicleForOrg, canApproveMissionRequests } = await import(
    "../src/lib/vehicle-check-approvers"
  );
  const { clearHrApprovalCache, setHrApprovalCacheForTest } = await import("../src/lib/hr-approval-roles");
  const db = getDb();
  for (const [id, code, cc] of [
    ["test_zm", "T-ZM", "ZM"],
    ["test_ls", "T-LS", "LS"],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO organizations (id, name, code, country, currency, timezone_offset, active)
       VALUES (?, ?, ?, ?, 'XXX', 2, 1)`,
    ).run(id, `Test ${cc}`, code, cc);
  }

  setHrApprovalCacheForTest(
    new Map<string, Emp>([
      ["zm.allocator@example.com", emp("zm.allocator@example.com", "user", [grant("vehicle_allocator", "ZM")])],
      ["global.allocator@example.com", emp("global.allocator@example.com", "user", [grant("vehicle_allocator", null)])],
      ["zm.approver@example.com", emp("zm.approver@example.com", "user", [grant("mission_approver", "ZM")])],
      [
        "zm.both@example.com",
        emp("zm.both@example.com", "user", [grant("mission_approver", "ZM"), grant("vehicle_allocator", "ZM")]),
      ],
      ["hr.super@example.com", emp("hr.super@example.com", "superadmin", [])],
      ["plain@example.com", emp("plain@example.com", "user", [])],
    ]),
  );

  // Role-only helper is unchanged.
  assert.equal(canAllocateFleetVehicle("fleet_lead"), true);
  assert.equal(canAllocateFleetVehicle("superadmin"), true);
  assert.equal(canAllocateFleetVehicle("Fleet_Lead"), true);
  assert.equal(canAllocateFleetVehicle("manager"), false);
  assert.equal(canAllocateFleetVehicle("user"), false);

  // Role fast path still works with no HR grant.
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_zm", "plain@example.com", "fleet_lead"), true);
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_zm", "plain@example.com", "superadmin"), true);

  // Country-scoped HR grant: only in matching-country orgs.
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_zm", "zm.allocator@example.com", "user"), true);
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_zm", "ZM.Allocator@Example.com", "manager"), true);
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_ls", "zm.allocator@example.com", "user"), false);
  assert.equal(await canAllocateFleetVehicleForOrg(db, "unknown_org", "zm.allocator@example.com", "user"), false);

  // Global grant works everywhere.
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_ls", "global.allocator@example.com", "user"), true);
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_zm", "global.allocator@example.com", "user"), true);

  // Mission approver grant does NOT confer allocation; manager role alone does not either.
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_zm", "zm.approver@example.com", "user"), false);
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_zm", "plain@example.com", "manager"), false);
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_zm", "plain@example.com", "user"), false);
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_zm", "", "user"), false);

  // HR superadmin short-circuits, consistent with hasHrFmApprovalRole.
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_ls", "hr.super@example.com", "user"), true);

  // Someone holding both HR grants can approve AND allocate in ZM (not as fleet_lead).
  assert.equal(await canApproveMissionRequests(db, "test_zm", "zm.both@example.com", "user"), true);
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_zm", "zm.both@example.com", "user"), true);
  assert.equal(await canAllocateFleetVehicleForOrg(db, "test_ls", "zm.both@example.com", "user"), false);

  clearHrApprovalCache();
  console.log("hr vehicle allocator tests passed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
