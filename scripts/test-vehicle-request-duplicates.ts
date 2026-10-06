#!/usr/bin/env tsx
/**
 * Second vehicle request on a mission: held until the submitter replaces the
 * open one or confirms a separate request. Run: npm run test:vr-duplicates
 */
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  decideMissionRequestInsert,
  findOpenMissionRequests,
  requestorMayEditRequest,
  supersedeRequests,
  SUPERSEDE_REASON,
} from "../src/lib/vehicle-request-duplicates";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE vehicles (id TEXT PRIMARY KEY, code TEXT);
  CREATE TABLE vehicle_requests (
    id TEXT PRIMARY KEY, organization_id TEXT, mission_id TEXT, purpose TEXT, status TEXT,
    created_at TEXT, requested_by_id TEXT, requested_by_name TEXT, assigned_vehicle_id TEXT,
    rejection_reason TEXT, updated_at TEXT
  );
  CREATE TABLE record_mutation_log (
    id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, organization_id TEXT, action TEXT,
    actor_id TEXT, actor_name TEXT, actor_role TEXT, actor_department TEXT,
    before_json TEXT, after_json TEXT, reason TEXT, created_at TEXT
  );
  INSERT INTO vehicles (id, code) VALUES ('veh-jmc', 'JMC');
`);

const actor = { id: "u1", name: "Katleho", role: "", department: "" };

let minute = 0;
function insert(id: string, missionId: string | null, status = "requested", vehicle: string | null = null): void {
  minute += 1;
  db.prepare(
    `INSERT INTO vehicle_requests (id, organization_id, mission_id, purpose, status, created_at, requested_by_id, requested_by_name, assigned_vehicle_id)
     VALUES (?, '1pwr_lesotho', ?, 'TLH troubleshooting', ?, ?, 'u1', 'Katleho', ?)`,
  ).run(id, missionId, status, `2026-10-06T09:${String(minute).padStart(2, "0")}:00Z`, vehicle);
}

/** Mirrors the POST transaction: check, optionally supersede, then insert. */
function submit(id: string, missionId: string, resolution?: string, reason?: string) {
  return db.transaction(() => {
    const decision = decideMissionRequestInsert(findOpenMissionRequests(db, missionId), resolution, reason);
    if (!decision.ok) return decision;
    if (decision.supersedeIds.length > 0) supersedeRequests(db, decision.supersedeIds, "1pwr_lesotho", actor, "2026-10-06T10:00:00Z");
    insert(id, missionId);
    return decision;
  }).immediate();
}

function status(id: string): string {
  return (db.prepare("SELECT status FROM vehicle_requests WHERE id = ?").get(id) as { status: string }).status;
}

function count(missionId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM vehicle_requests WHERE mission_id = ?").get(missionId) as { n: number }).n;
}

// First request on a mission goes straight in.
assert.equal(submit("vr-1", "m-tlh").ok, true);

// A second submit with no choice is held and nothing is inserted.
const held = submit("vr-2", "m-tlh");
assert.equal(held.ok, false);
if (!held.ok) {
  assert.equal(held.status, 409);
  assert.equal(held.body.code, "open_request_exists");
  assert.equal((held.body.requests as unknown[]).length, 1);
}
assert.equal(count("m-tlh"), 1);

// Separate needs a reason.
const noReason = submit("vr-2", "m-tlh", "separate", "dup");
assert.equal(noReason.ok, false);
if (!noReason.ok) assert.equal(noReason.status, 400);
assert.equal(count("m-tlh"), 1);

// With a reason, a second row sits beside the first.
const separate = submit("vr-2", "m-tlh", "separate", "second vehicle for the crew");
assert.equal(separate.ok, true);
if (separate.ok) assert.equal(separate.separateReason, "second vehicle for the crew");
assert.equal(status("vr-1"), "requested");
assert.equal(status("vr-2"), "requested");

// Supersede cancels every unallocated open request and leaves only the new one.
const replaced = submit("vr-3", "m-tlh", "supersede");
assert.equal(replaced.ok, true);
assert.equal(status("vr-1"), "cancelled");
assert.equal(status("vr-2"), "cancelled");
assert.equal(status("vr-3"), "requested");
const reason = db.prepare("SELECT rejection_reason FROM vehicle_requests WHERE id = 'vr-1'").get() as { rejection_reason: string };
assert.equal(reason.rejection_reason, SUPERSEDE_REASON);
const audit = db.prepare("SELECT COUNT(*) AS n FROM record_mutation_log WHERE action = 'allocation_cancel'").get() as { n: number };
assert.equal(audit.n, 2);

// A request that already has a vehicle is not replaced by starting over.
insert("vr-alloc", "m-alloc", "assigned", "veh-jmc");
const refused = submit("vr-4", "m-alloc", "supersede");
assert.equal(refused.ok, false);
if (!refused.ok) assert.equal(refused.body.code, "open_request_allocated");
assert.equal(status("vr-alloc"), "assigned");
const open = findOpenMissionRequests(db, "m-alloc");
assert.equal(open[0].allocated, true);
assert.equal(open[0].assignedVehicleCode, "JMC");
// ...but a confirmed separate request is still allowed.
assert.equal(submit("vr-4", "m-alloc", "separate", "second vehicle for the crew").ok, true);

// Supersede with a mix keeps the allocated one and cancels the rest.
insert("vr-mix-a", "m-mix", "assigned", "veh-jmc");
insert("vr-mix-b", "m-mix");
assert.equal(submit("vr-mix-c", "m-mix", "supersede").ok, true);
assert.equal(status("vr-mix-a"), "assigned");
assert.equal(status("vr-mix-b"), "cancelled");

// Closed requests do not trigger the prompt.
insert("vr-old", "m-closed", "cancelled");
assert.equal(submit("vr-new", "m-closed").ok, true);

// Requests with no mission are never held.
assert.deepEqual(findOpenMissionRequests(db, ""), []);
assert.equal(decideMissionRequestInsert([], undefined, undefined).ok, true);

// Requestor edits: own, unallocated, form fields only.
const own = { requested_by_id: "u1", status: "requested", assigned_vehicle_id: null };
assert.equal(requestorMayEditRequest(own, "u1", ["purpose", "notes", "designatedOperatorId"]), true);
assert.equal(requestorMayEditRequest(own, "u2", ["purpose"]), false, "someone else's request");
assert.equal(requestorMayEditRequest(own, "u1", ["status"]), false, "cannot change status");
assert.equal(requestorMayEditRequest(own, "u1", ["assignedVehicleId"]), false, "cannot assign");
assert.equal(
  requestorMayEditRequest({ ...own, status: "assigned", assigned_vehicle_id: "veh-jmc" }, "u1", ["purpose"]),
  false,
  "locked once a vehicle is allocated",
);
assert.equal(requestorMayEditRequest({ ...own, status: "cancelled" }, "u1", ["purpose"]), false);
assert.equal(requestorMayEditRequest({ ...own, assigned_vehicle_id: "unallocated_x" }, "u1", ["purpose"]), true);

console.log("vehicle request duplicates: ok");
