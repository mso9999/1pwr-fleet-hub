#!/usr/bin/env tsx
/**
 * Tests for the stale work-order finder. Run: npm run test:stale-wos
 */
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { findStaleWorkOrders } from "../src/lib/stale-work-orders";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE vehicles (id TEXT PRIMARY KEY, code TEXT NOT NULL DEFAULT '');
  CREATE TABLE work_orders (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, vehicle_id TEXT NOT NULL,
    work_order_number TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'submitted', priority TEXT NOT NULL DEFAULT 'medium',
    assigned_to TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  );
  CREATE TABLE work_order_status_history (id INTEGER PRIMARY KEY, work_order_id TEXT, changed_at TEXT);
  CREATE TABLE work_order_updates (id TEXT PRIMARY KEY, work_order_id TEXT, created_at TEXT);
  CREATE TABLE work_order_labor (id TEXT PRIMARY KEY, work_order_id TEXT, created_at TEXT);
  CREATE TABLE work_order_po_links (id TEXT PRIMARY KEY, work_order_id TEXT, created_at TEXT);
  INSERT INTO vehicles (id, code) VALUES ('v1', 'R1');
`);

const old = "2026-09-01T08:00:00.000Z";
const recent = "2099-01-01T08:00:00.000Z"; // future → never stale

// wo1: old, open, no movement → stale
db.prepare("INSERT INTO work_orders (id, organization_id, vehicle_id, work_order_number, title, status, created_at) VALUES ('wo1', '1pwr_lesotho', 'v1', 'WO-1', 'Old open', 'in-progress', ?)").run(old);
// wo2: old but completed → never stale
db.prepare("INSERT INTO work_orders (id, organization_id, vehicle_id, work_order_number, title, status, created_at) VALUES ('wo2', '1pwr_lesotho', 'v1', 'WO-2', 'Old done', 'completed', ?)").run(old);
// wo3: old but has a recent labor line → not stale
db.prepare("INSERT INTO work_orders (id, organization_id, vehicle_id, work_order_number, title, status, created_at) VALUES ('wo3', '1pwr_lesotho', 'v1', 'WO-3', 'Old but active', 'in-progress', ?)").run(old);
db.prepare("INSERT INTO work_order_labor (id, work_order_id, created_at) VALUES ('l1', 'wo3', ?)").run(recent);
// wo4: old, open, recent status change → not stale
db.prepare("INSERT INTO work_orders (id, organization_id, vehicle_id, work_order_number, title, status, created_at) VALUES ('wo4', '1pwr_lesotho', 'v1', 'WO-4', 'Old statused', 'awaiting-parts', ?)").run(old);
db.prepare("INSERT INTO work_order_status_history (work_order_id, changed_at) VALUES ('wo4', ?)").run(recent);
// wo5: other org → not returned
db.prepare("INSERT INTO work_orders (id, organization_id, vehicle_id, work_order_number, title, status, created_at) VALUES ('wo5', '1pwr_benin', 'v1', 'WO-5', 'Benin old', 'in-progress', ?)").run(old);

const stale = findStaleWorkOrders(db, "1pwr_lesotho", 3);
const ids = stale.map((s) => s.id);
assert.deepEqual(ids, ["wo1"]);
assert.equal(stale[0].work_order_number, "WO-1");
assert.ok(stale[0].days_stale >= 3);

console.log("stale work-order finder: all tests passed.");
