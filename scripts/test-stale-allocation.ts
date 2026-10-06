#!/usr/bin/env tsx
/**
 * Unallocated vehicle requests: orphan sweep + warn/cancel clock.
 * Run: npm run test:stale-allocation
 */
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { decideStaleAllocation } from "../src/lib/stale-allocation";
import { runStaleAllocationCleanup } from "../src/lib/stale-allocation-job";
import { runStaleNoTripCleanup } from "../src/lib/stale-no-trip-job";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

assert.equal(decideStaleAllocation({ now: day("2026-01-07"), pendingSince: day("2026-01-01"), warningSentAt: null }), "none");
assert.equal(decideStaleAllocation({ now: day("2026-01-08"), pendingSince: day("2026-01-01"), warningSentAt: null }), "warn");
assert.equal(
  decideStaleAllocation({ now: day("2026-01-12"), pendingSince: day("2026-01-01"), warningSentAt: day("2026-01-08") }),
  "none",
);
assert.equal(
  decideStaleAllocation({ now: day("2026-01-15"), pendingSince: day("2026-01-01"), warningSentAt: day("2026-01-08") }),
  "cancel",
);
// Already past the deadline on first sight: warn, never silently cancel.
assert.equal(
  decideStaleAllocation({ now: day("2026-03-01"), pendingSince: day("2026-01-01"), warningSentAt: null }),
  "warn",
);
// A warning from before this approval does not count.
assert.equal(
  decideStaleAllocation({ now: day("2026-01-20"), pendingSince: day("2026-01-10"), warningSentAt: day("2026-01-05") }),
  "warn",
);

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, firebase_uid TEXT, email TEXT, role TEXT, organization_id TEXT);
  CREATE TABLE missions (
    id TEXT PRIMARY KEY, organization_id TEXT, title TEXT, destination TEXT, departure_date TEXT,
    created_by_id TEXT, approval_status TEXT, lifecycle_status TEXT, status TEXT, trip_id TEXT,
    transport_mode TEXT, approved_at TEXT, no_trip_warned_at TEXT, no_trip_warn_stage INTEGER DEFAULT 0,
    rejection_reason TEXT, updated_at TEXT
  );
  CREATE TABLE vehicle_requests (
    id TEXT PRIMARY KEY, organization_id TEXT, mission_id TEXT, purpose TEXT, destination TEXT,
    departure_date TEXT, requested_by_id TEXT, created_at TEXT, status TEXT, assigned_vehicle_id TEXT,
    stale_allocation_warned_at TEXT, rejection_reason TEXT, updated_at TEXT
  );
  CREATE TABLE record_mutation_log (
    id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, organization_id TEXT, action TEXT,
    actor_id TEXT, actor_name TEXT, actor_role TEXT, actor_department TEXT,
    before_json TEXT, after_json TEXT, reason TEXT, created_at TEXT
  );
`);

db.prepare("INSERT INTO users (id, email, role, organization_id) VALUES ('req', 'driver@1pwr.org', 'driver', '1pwr_lesotho')").run();
db.prepare("INSERT INTO users (id, email, role, organization_id) VALUES ('lead', 'lead@1pwr.org', 'fleet_lead', '1pwr_lesotho')").run();

function mission(id: string, approval: string, lifecycle: string, approvedAt: string | null): void {
  db.prepare(
    `INSERT INTO missions (id, organization_id, title, destination, departure_date, created_by_id, approval_status, lifecycle_status, status, trip_id, transport_mode, approved_at)
     VALUES (?, '1pwr_lesotho', ?, 'Mafeteng', '2026-01-02', 'req', ?, ?, 'planned', '', 'company_vehicle', ?)`,
  ).run(id, id, approval, lifecycle, approvedAt);
}

function request(id: string, missionId: string, createdAt: string, status = "requested", vehicle = ""): void {
  db.prepare(
    `INSERT INTO vehicle_requests (id, organization_id, mission_id, purpose, destination, departure_date, requested_by_id, created_at, status, assigned_vehicle_id)
     VALUES (?, '1pwr_lesotho', ?, ?, 'Mafeteng', '2026-01-02', 'req', ?, ?, ?)`,
  ).run(id, missionId, id, createdAt, status, vehicle);
}

mission("m-orphan", "approved", "expired_no_trip", "2025-12-01T00:00:00.000Z");
request("vr-orphan", "m-orphan", "2025-12-01 08:00:00");
mission("m-pending", "pending", "active", null);
request("vr-pending", "m-pending", "2025-11-01 08:00:00");
mission("m-deferred", "approved", "deferred", "2025-11-01T00:00:00.000Z");
request("vr-deferred", "m-deferred", "2025-11-01 08:00:00");
mission("m-fresh", "approved", "active", "2026-01-10T00:00:00.000Z");
request("vr-fresh", "m-fresh", "2026-01-01 08:00:00");
mission("m-due", "approved", "active", "2026-01-01T00:00:00.000Z");
request("vr-due", "m-due", "2026-01-01 08:00:00");
mission("m-assigned", "approved", "active", "2025-12-01T00:00:00.000Z");
request("vr-assigned", "m-assigned", "2025-12-01 08:00:00", "assigned", "veh-1");

const sent: string[][] = [];
const failingMail = async () => ({ ok: false as const, error: "smtp down" });

async function main(): Promise<void> {
  const now = day("2026-01-12");
  const first = await runStaleAllocationCleanup(db, {
    now,
    sendMail: async (message) => {
      sent.push(message.to);
      return { ok: true };
    },
  });

  assert.equal(first.orphansClosed, 1, "expired mission's request is cancelled on sight");
  assert.equal(first.warned, 1, "11-day-old live request is warned");
  assert.equal(first.cancelled, 0, "nothing is cancelled on its warning run");
  assert.equal(statusOf("vr-orphan"), "cancelled");
  assert.equal(statusOf("vr-pending"), "requested", "pending approval stays with the approval timeout");
  assert.equal(statusOf("vr-deferred"), "requested", "a deferred mission is a hold, not a stale request");
  assert.equal(statusOf("vr-fresh"), "requested", "clock starts at approval, not at creation");
  assert.equal(statusOf("vr-assigned"), "assigned");
  assert.ok(warnedAt("vr-due"), "warning is stamped");
  assert.ok(sent.every((to) => to.includes("driver@1pwr.org") || to.includes("lead@1pwr.org")));

  // A failed email retries the warning next run and still closes orphans.
  mission("m-orphan-2", "approved", "capacity_cancelled", "2025-12-01T00:00:00.000Z");
  request("vr-orphan-2", "m-orphan-2", "2025-12-01 08:00:00");
  db.prepare("UPDATE vehicle_requests SET stale_allocation_warned_at = NULL WHERE id = 'vr-due'").run();
  const failed = await runStaleAllocationCleanup(db, { now, sendMail: failingMail });
  assert.equal(failed.warned, 0);
  assert.equal(failed.emailFailures > 0, true);
  assert.equal(warnedAt("vr-due"), null, "a failed email does not stamp the warning");
  assert.equal(statusOf("vr-orphan-2"), "cancelled", "orphans close even when email fails");

  // With the warning stamped, day 14 cancels.
  db.prepare("UPDATE vehicle_requests SET stale_allocation_warned_at = '2026-01-08T00:00:00.000Z' WHERE id = 'vr-due'").run();
  const second = await runStaleAllocationCleanup(db, {
    now: day("2026-01-15"),
    sendMail: async () => ({ ok: true }),
  });
  assert.equal(second.cancelled, 1);
  assert.equal(statusOf("vr-due"), "cancelled");
  const reason = db.prepare("SELECT rejection_reason FROM vehicle_requests WHERE id = 'vr-due'").get() as { rejection_reason: string };
  assert.match(reason.rejection_reason, /14 days/);

  // Clearing a mission for no trip cancels its open request in the same step.
  mission("m-notrip", "approved", "active", "2026-01-01T00:00:00.000Z");
  db.prepare("UPDATE missions SET no_trip_warn_stage = 3, no_trip_warned_at = '2026-01-15T00:00:00.000Z' WHERE id = 'm-notrip'").run();
  request("vr-notrip", "m-notrip", "2026-01-01 08:00:00");
  const expired = await runStaleNoTripCleanup(db, { now: day("2026-01-16"), sendMail: async () => ({ ok: true }) });
  assert.equal(expired.expired, 1);
  assert.equal(statusOf("vr-notrip"), "cancelled");

  console.log("stale allocation: ok");
}

function statusOf(id: string): string {
  return (db.prepare("SELECT status FROM vehicle_requests WHERE id = ?").get(id) as { status: string }).status;
}

function warnedAt(id: string): string | null {
  return (db.prepare("SELECT stale_allocation_warned_at FROM vehicle_requests WHERE id = ?").get(id) as { stale_allocation_warned_at: string | null }).stale_allocation_warned_at;
}

void main();
