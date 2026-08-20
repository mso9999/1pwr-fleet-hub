#!/usr/bin/env tsx
/**
 * Unit tests for the transmission derate (AT-only) gate: driver scope vs
 * vehicle transmission. Run: `npm run test:transmission-scope`
 */

import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  evaluateTransmissionGate,
  getDriverTransmissionScope,
  normalizeTransmission,
  normalizeTransmissionScope,
} from "../src/lib/transmission-scope";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE vehicles (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      code TEXT NOT NULL DEFAULT '',
      transmission TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE ehs_approved_drivers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL DEFAULT '1pwr_lesotho',
      email TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE ehs_operator_authorizations (
      id TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL,
      category_code TEXT NOT NULL,
      grant TEXT NOT NULL DEFAULT 'none',
      transmission_scope TEXT NOT NULL DEFAULT 'any'
    );
  `);
  db.prepare("INSERT INTO vehicles (id, code, transmission) VALUES ('v-auto', 'Pajero', 'automatic')").run();
  db.prepare("INSERT INTO vehicles (id, code, transmission) VALUES ('v-man', 'Hilux', 'manual')").run();
  db.prepare("INSERT INTO vehicles (id, code, transmission) VALUES ('v-unk', 'Surf', '')").run();
  db.prepare("INSERT INTO ehs_approved_drivers (id, email, display_name) VALUES ('d-full', 'full@x', 'Full Scope')").run();
  db.prepare("INSERT INTO ehs_approved_drivers (id, email, display_name) VALUES ('d-at', 'at@x', 'AT Driver')").run();
  db.prepare(
    "INSERT INTO ehs_operator_authorizations (id, operator_id, category_code, grant, transmission_scope) VALUES ('a1', 'd-full', 'fleet_vehicle_onroad', 'approved', 'any')",
  ).run();
  db.prepare(
    "INSERT INTO ehs_operator_authorizations (id, operator_id, category_code, grant, transmission_scope) VALUES ('a2', 'd-at', 'fleet_vehicle_onroad', 'approved', 'automatic_only')",
  ).run();
  return db;
}

// Normalization
assert.equal(normalizeTransmission("Automatic"), "automatic");
assert.equal(normalizeTransmission("AT"), "automatic");
assert.equal(normalizeTransmission("a/t"), "automatic");
assert.equal(normalizeTransmission("Manual"), "manual");
assert.equal(normalizeTransmission("M/T"), "manual");
assert.equal(normalizeTransmission(""), "");
assert.equal(normalizeTransmission("unknown"), "");
assert.equal(normalizeTransmissionScope("automatic_only"), "automatic_only");
assert.equal(normalizeTransmissionScope("any"), "any");
assert.equal(normalizeTransmissionScope(""), "any");
assert.equal(normalizeTransmissionScope(undefined), "any");

const db = makeDb();
const ORG = "1pwr_lesotho";

// Scope lookup
assert.equal(getDriverTransmissionScope(db, "d-at"), "automatic_only");
assert.equal(getDriverTransmissionScope(db, "d-full"), "any");
assert.equal(getDriverTransmissionScope(db, "nobody"), "any");

// AT-only driver: automatic vehicle → satisfied
let r = evaluateTransmissionGate(db, { organizationId: ORG, operatorId: "d-at", vehicleId: "v-auto" });
assert.equal(r.status, "satisfied");
assert.equal(r.vehicleTransmission, "automatic");
assert.equal(r.driverScope, "automatic_only");

// AT-only driver: manual vehicle → blocked
r = evaluateTransmissionGate(db, { organizationId: ORG, operatorId: "d-at", vehicleId: "v-man" });
assert.equal(r.status, "blocked");
assert.match(r.detail, /automatic-transmission vehicles only/);
assert.match(r.detail, /manual/);

// AT-only driver: unrecorded transmission → blocked (approval valid only for known-automatic)
r = evaluateTransmissionGate(db, { organizationId: ORG, operatorId: "d-at", vehicleId: "v-unk" });
assert.equal(r.status, "blocked");
assert.match(r.detail, /no transmission recorded/);

// Full-scope driver: manual → satisfied
r = evaluateTransmissionGate(db, { organizationId: ORG, operatorId: "d-full", vehicleId: "v-man" });
assert.equal(r.status, "satisfied");

// Full-scope driver: unrecorded → satisfied
r = evaluateTransmissionGate(db, { organizationId: ORG, operatorId: "d-full", vehicleId: "v-unk" });
assert.equal(r.status, "satisfied");

console.log("transmission-scope gate: all tests passed.");
