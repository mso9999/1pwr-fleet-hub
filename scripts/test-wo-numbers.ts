#!/usr/bin/env tsx
/**
 * Unit tests for work-order number allocation. Run: npm run test:wo-numbers
 */
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { allocateWorkOrderNumber } from "../src/lib/work-order-numbers";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE organizations (id TEXT PRIMARY KEY, code TEXT);
  CREATE TABLE work_order_seq (
    organization_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (organization_id, year)
  );
`);
db.prepare("INSERT INTO organizations (id, code) VALUES ('1pwr_lesotho', '1PWR-LS')").run();
db.prepare("INSERT INTO organizations (id, code) VALUES ('1pwr_benin', '1PWR-BJ')").run();

const year = new Date().getFullYear();

// Sequential allocation per org
const a1 = allocateWorkOrderNumber(db, "1pwr_lesotho");
const a2 = allocateWorkOrderNumber(db, "1pwr_lesotho");
assert.equal(a1, `WO-LS-${year}-00001`);
assert.equal(a2, `WO-LS-${year}-00002`);

// Independent sequence per org
const b1 = allocateWorkOrderNumber(db, "1pwr_benin");
assert.equal(b1, `WO-BJ-${year}-00001`);

// Unknown org falls back to ORG code
const x1 = allocateWorkOrderNumber(db, "nowhere");
assert.equal(x1, `WO-ORG-${year}-00001`);

console.log("work-order numbers: all tests passed.");
