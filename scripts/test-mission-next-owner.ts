#!/usr/bin/env tsx
/**
 * Mission next-owner resolution. Run: npx tsx scripts/test-mission-next-owner.ts
 */
import assert from "node:assert/strict";
import { resolveMissionNextOwner } from "../src/lib/mission-next-owner";

const base = {
  id: "m1",
  approval_status: "approved",
  lifecycle_status: "active",
  created_by_name: "Katleho Thakholi",
};

assert.equal(resolveMissionNextOwner({ ...base, approval_status: "pending" }).kind, "await_approval");
assert.equal(resolveMissionNextOwner({ ...base }).kind, "create_trip");
assert.match(resolveMissionNextOwner({ ...base }).owner, /Katleho/);
assert.ok(resolveMissionNextOwner({ ...base }).href?.includes("mission=m1"));

assert.equal(
  resolveMissionNextOwner({ ...base, trip_id: "t1" }).kind,
  "allocate_vehicle"
);
assert.equal(resolveMissionNextOwner({ ...base, trip_id: "t1" }).owner, "Fleet lead");

assert.equal(
  resolveMissionNextOwner({
    ...base,
    trip_id: "t1",
    assigned_vehicle_id: "v1",
    assigned_vehicle_code: "X2",
  }).kind,
  "checklist_or_depart"
);

assert.equal(
  resolveMissionNextOwner({
    ...base,
    trip_id: "t1",
    transport_mode: "public_transport",
  }).kind,
  "checklist_or_depart"
);

assert.equal(
  resolveMissionNextOwner({
    ...base,
    trip_id: "t1",
    assigned_vehicle_id: "unallocated_1pwr_lesotho",
  }).kind,
  "allocate_vehicle"
);

assert.equal(
  resolveMissionNextOwner({ ...base, lifecycle_status: "deferred" }).kind,
  "inactive"
);

console.log("mission-next-owner: all tests passed.");
