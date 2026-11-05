#!/usr/bin/env tsx
/**
 * Fuel request is filed only against a trip that has a vehicle.
 * Run: npx tsx scripts/test-fuel-request-gate.ts
 */
import assert from "node:assert/strict";
import { fuelPrUrl, fuelRequestGate } from "../src/lib/fuel-request-gate";

const base = { id: "m1", fuel_budget: 1622.44, assigned_vehicle_id: "v1", assigned_vehicle_code: "G1" };

assert.equal(fuelRequestGate({ ...base, trip_id: null, assigned_vehicle_id: null }).reason, "create_trip");
assert.match(fuelRequestGate({ ...base, trip_id: "" }).href || "", /mission=m1/);

const waiting = fuelRequestGate({ ...base, trip_id: "t1", assigned_vehicle_id: "unallocated_x", assigned_vehicle_code: "UNALLOCATED" });
assert.equal(waiting.ready, false);
if (!waiting.ready) assert.equal(waiting.reason, "assign_vehicle");

const unpriced = fuelRequestGate({ ...base, trip_id: "t1", fuel_budget: null });
assert.equal(unpriced.ready, false);
if (!unpriced.ready) assert.equal(unpriced.reason, "no_budget");

const ready = fuelRequestGate({ ...base, trip_id: "t1" });
assert.equal(ready.ready, true);
if (ready.ready) assert.equal(ready.tripId, "t1");

const url = fuelPrUrl({ missionId: "m1", tripId: "t1", organizationId: "1pwr_lesotho" });
assert.match(url, /mission=m1/);
assert.match(url, /trip=t1/);
assert.match(url, /org=1pwr_lesotho/);

console.log("fuel request gate OK");
