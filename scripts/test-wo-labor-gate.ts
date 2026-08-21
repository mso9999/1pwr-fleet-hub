#!/usr/bin/env tsx
/**
 * Unit tests for the work-order completion labor gate. Run:
 *   npm run test:wo-labor-gate
 */
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { laborGateForCompletion } from "../src/lib/work-order-completion";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE work_order_labor (
      id TEXT PRIMARY KEY,
      work_order_id TEXT NOT NULL,
      worker_name TEXT NOT NULL DEFAULT '',
      hours REAL NOT NULL DEFAULT 0
    );
  `);
  return db;
}

const db = makeDb();

// In-house WO with no labor → blocked
let r = laborGateForCompletion(db, { id: "wo-1", repair_location: "hq" });
assert.equal(r.ok, false);
assert.match(r.reason || "", /logged effort/);

// Field repair with no labor → blocked
r = laborGateForCompletion(db, { id: "wo-1", repair_location: "field" });
assert.equal(r.ok, false);

// Third-party repair, no labor → allowed (exempt)
r = laborGateForCompletion(db, { id: "wo-1", repair_location: "3rd-party" });
assert.equal(r.ok, true);

// Labor line with zero hours → still blocked
db.prepare("INSERT INTO work_order_labor (id, work_order_id, worker_name, hours) VALUES ('l1', 'wo-1', 'Kola', 0)").run();
r = laborGateForCompletion(db, { id: "wo-1", repair_location: "hq" });
assert.equal(r.ok, false);

// Labor line with hours → allowed
db.prepare("INSERT INTO work_order_labor (id, work_order_id, worker_name, hours) VALUES ('l2', 'wo-1', 'Kola', 1.5)").run();
r = laborGateForCompletion(db, { id: "wo-1", repair_location: "hq" });
assert.equal(r.ok, true);

// Labor on a DIFFERENT WO doesn't count
r = laborGateForCompletion(db, { id: "wo-2", repair_location: "hq" });
assert.equal(r.ok, false);

console.log("work-order labor gate: all tests passed.");
