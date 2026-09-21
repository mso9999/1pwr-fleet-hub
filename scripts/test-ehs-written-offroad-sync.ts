#!/usr/bin/env tsx
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { applyWrittenOffroadPass } from "../src/lib/ehs-written-offroad-sync";

function makeDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE ehs_approved_drivers (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      email TEXT,
      display_name TEXT,
      written_offroad_result TEXT,
      written_test_passed_at TEXT,
      attested_by_id TEXT,
      attested_by_name TEXT,
      attested_at TEXT,
      updated_at TEXT,
      updated_by_id TEXT,
      updated_by_name TEXT
    );
    CREATE TABLE record_mutation_log (
      id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      organization_id TEXT,
      action TEXT,
      actor_id TEXT,
      actor_name TEXT,
      actor_role TEXT,
      actor_department TEXT,
      before_json TEXT,
      after_json TEXT,
      reason TEXT,
      created_at TEXT
    );
  `);
  db.prepare(
    `INSERT INTO ehs_approved_drivers
      (id, organization_id, email, display_name, written_offroad_result, written_test_passed_at,
       attested_by_id, attested_by_name, attested_at, updated_at, updated_by_id, updated_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "op-1",
    "1pwr_lesotho",
    "driver@1pwrafrica.com",
    "Driver",
    "pending",
    "",
    "ehs-lead",
    "EHS Lead",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
    "ehs-lead",
    "EHS Lead"
  );
  return db;
}

const db = makeDb();
const missing = applyWrittenOffroadPass(db, {
  email: "nobody@1pwrafrica.com",
  organizationId: "1pwr_lesotho",
  attemptId: "att-0",
  passedAt: "2026-09-19T10:00:00.000Z",
  score: 1,
});
assert.equal(missing.found, false);

const first = applyWrittenOffroadPass(db, {
  email: "Driver@1pwrafrica.com",
  organizationId: "1pwr_lesotho",
  attemptId: "att-1",
  passedAt: "2026-09-19T10:00:00.000Z",
  score: 0.89,
});
assert.equal(first.found, true);
if (!first.found) throw new Error("expected found");
assert.equal(first.alreadyPassed, false);
assert.equal(first.writtenOffroadResult, "pass");

const row = db.prepare("SELECT * FROM ehs_approved_drivers WHERE id = 'op-1'").get() as {
  attested_at: string;
  attested_by_id: string;
  written_offroad_result: string;
};
assert.equal(row.attested_at, "2026-01-01T00:00:00.000Z");
assert.equal(row.attested_by_id, "ehs-lead");
assert.equal(row.written_offroad_result, "pass");

const second = applyWrittenOffroadPass(db, {
  email: "driver@1pwrafrica.com",
  organizationId: "1pwr_lesotho",
  attemptId: "att-2",
  passedAt: "2026-09-20T10:00:00.000Z",
  score: 1,
});
assert.equal(second.found, true);
if (!second.found) throw new Error("expected found");
assert.equal(second.alreadyPassed, true);
assert.equal(second.writtenTestPassedAt, "2026-09-19T10:00:00.000Z");

console.log("ehs written-offroad sync tests passed");
