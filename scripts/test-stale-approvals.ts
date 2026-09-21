#!/usr/bin/env tsx
/**
 * Stale approval timeout. Run: npm run test:stale-approvals
 */
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { decideStaleApproval } from "../src/lib/stale-approval";
import { runStaleApprovalTimeout } from "../src/lib/stale-approval-job";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

assert.equal(decideStaleApproval({ now: day("2026-01-19"), pendingSince: day("2026-01-01"), warningSentAt: null }), "none");
assert.equal(decideStaleApproval({ now: day("2026-01-21"), pendingSince: day("2026-01-01"), warningSentAt: null }), "warn");
assert.equal(
  decideStaleApproval({ now: day("2026-01-25"), pendingSince: day("2026-01-01"), warningSentAt: day("2026-01-21") }),
  "none",
);
assert.equal(
  decideStaleApproval({ now: day("2026-01-31"), pendingSince: day("2026-01-01"), warningSentAt: day("2026-01-21") }),
  "reject",
);
assert.equal(
  decideStaleApproval({ now: day("2026-02-15"), pendingSince: day("2026-01-01"), warningSentAt: null }),
  "warn",
);
assert.equal(
  decideStaleApproval({ now: day("2026-01-31"), pendingSince: day("2026-01-01"), warningSentAt: day("2025-12-15") }),
  "warn",
);

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE organizations (id TEXT PRIMARY KEY, country TEXT);
  CREATE TABLE users (id TEXT PRIMARY KEY, firebase_uid TEXT, email TEXT);
  CREATE TABLE missions (
    id TEXT PRIMARY KEY, organization_id TEXT, title TEXT, destination TEXT, departure_date TEXT,
    created_by_id TEXT, created_at TEXT, approval_status TEXT, lifecycle_status TEXT,
    stale_approval_warned_at TEXT, hr_request_id TEXT, approved_by_id TEXT, approved_by_name TEXT,
    approved_at TEXT, rejection_reason TEXT, updated_at TEXT
  );
  CREATE TABLE vehicle_requests (
    id TEXT PRIMARY KEY, organization_id TEXT, mission_id TEXT, purpose TEXT, destination TEXT,
    departure_date TEXT, requested_by_id TEXT, created_at TEXT, status TEXT,
    stale_approval_warned_at TEXT, approved_by_id TEXT, approved_by_name TEXT,
    rejection_reason TEXT, updated_at TEXT
  );
  CREATE TABLE record_mutation_log (
    id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, organization_id TEXT, action TEXT,
    actor_id TEXT, actor_name TEXT, actor_role TEXT, actor_department TEXT,
    before_json TEXT, after_json TEXT, reason TEXT, created_at TEXT
  );
  INSERT INTO organizations (id, country) VALUES ('1pwr_lesotho', 'LS');
  INSERT INTO users (id, email) VALUES ('user-1', 'driver@1pwr.org');
`);

db.prepare(
  `INSERT INTO missions (id, organization_id, title, destination, departure_date, created_by_id, created_at, approval_status, lifecycle_status, hr_request_id)
   VALUES ('m-old', '1pwr_lesotho', 'Old trip', 'Sehlabathebe', '2026-01-02', 'user-1', '2026-01-01 08:00:00', 'pending', 'active', '')`,
).run();
db.prepare(
  `INSERT INTO missions (id, organization_id, title, destination, departure_date, created_by_id, created_at, approval_status, lifecycle_status, stale_approval_warned_at, hr_request_id)
   VALUES ('m-due', '1pwr_lesotho', 'Due trip', 'Qacha', '2025-12-02', 'user-1', '2025-12-01 08:00:00', 'pending', 'active', '2025-12-21T00:00:00.000Z', '')`,
).run();
db.prepare(
  `INSERT INTO vehicle_requests (id, organization_id, mission_id, purpose, destination, requested_by_id, created_at, status)
   VALUES ('vr-linked', '1pwr_lesotho', 'm-due', 'haul', 'Qacha', 'user-1', '2025-12-01 08:00:00', 'requested')`,
).run();

async function main(): Promise<void> {
const sent: string[] = [];
const first = await runStaleApprovalTimeout(db, {
  now: day("2026-01-31"),
  directory: [{ id: 1, employee_id: "1", name: "Approver", email: "approver@1pwr.org", role: "", type: "", country: "LS", department: null, primary_deployment: null, current_position_title: null, employment_start_date: null, phone: null, headshot: null, status: "active", last_updated_at: null, toolset_approvals: [{ toolset: "fm", approval_role: "mission_approver", scope_country_code: "LS", scope_organization_id: null }] }],
  sendMail: async (message) => {
    sent.push(message.to[0]);
    return { ok: true };
  },
});

assert.equal(first.warned, 1);
assert.equal(first.rejected, 1);
const warned = db.prepare("SELECT stale_approval_warned_at FROM missions WHERE id = 'm-old'").get() as { stale_approval_warned_at: string };
assert.ok(warned.stale_approval_warned_at);
const rejected = db.prepare("SELECT approval_status FROM missions WHERE id = 'm-due'").get() as { approval_status: string };
assert.equal(rejected.approval_status, "rejected");
const linked = db.prepare("SELECT status FROM vehicle_requests WHERE id = 'vr-linked'").get() as { status: string };
assert.equal(linked.status, "rejected");
assert.ok(sent.includes("driver@1pwr.org"));
assert.ok(sent.includes("approver@1pwr.org"));
}

main().then(() => console.log("stale approvals: all tests passed."));
