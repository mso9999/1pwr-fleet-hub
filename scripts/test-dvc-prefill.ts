/**
 * Driver Vehicle Check prefill rules: defects carried over from the last check, confirmation,
 * and the wording of prefill markers / odometer warnings.
 *
 * Run with: npx tsx scripts/test-dvc-prefill.ts
 */
import assert from "node:assert/strict";
import {
  carryOverDefects,
  decideCarriedDefect,
  EMPTY_ITEM_STATE,
  odometerHintText,
  odometerWarning,
  pendingCarriedDefects,
  prefillHintText,
  setItem,
  shortDate,
} from "../src/lib/dvc-prefill";
import type { PreviousDefect } from "../src/lib/vehicle-check-context";

const defectsA: PreviousDefect[] = [
  { kind: "status", key: "driveBrakes", description: "Soft pedal" },
  { kind: "status", key: "fluidsFuel", description: "" },
  { kind: "equipment", key: "equipJack", description: "" },
];

// Carry-over pre-marks each defect and leaves it pending.
let s = carryOverDefects(EMPTY_ITEM_STATE, defectsA, new Set());
assert.equal(s.statusRatings.driveBrakes, "fail");
assert.equal(s.statusRatings.fluidsFuel, "fail");
assert.equal(s.equipChecks.equipJack, 0);
assert.equal(s.failureDescs.driveBrakes, "Soft pedal");
assert.equal(s.failureDescs.fluidsFuel, undefined);
assert.equal(pendingCarriedDefects(s).length, 3);
assert.deepEqual(EMPTY_ITEM_STATE, { statusRatings: {}, equipChecks: {}, failureDescs: {}, carried: {} }); // not mutated

// "Fixed" clears the item and the carried description; "Still present" keeps it failed.
s = decideCarriedDefect(s, "driveBrakes", "fixed");
assert.equal(s.statusRatings.driveBrakes, "pass");
assert.equal(s.failureDescs.driveBrakes, undefined);
assert.equal(s.carried.driveBrakes.decision, "fixed");
s = decideCarriedDefect(s, "driveBrakes", "present");
assert.equal(s.statusRatings.driveBrakes, "fail");
assert.equal(s.failureDescs.driveBrakes, "Soft pedal");
s = decideCarriedDefect(s, "equipJack", "fixed");
assert.equal(s.equipChecks.equipJack, 1);
assert.equal(decideCarriedDefect(s, "unknownKey", "fixed"), s);

// Choosing pass/fail in the grid confirms a carried item too.
s = setItem(s, "status", "fluidsFuel", true);
assert.equal(s.carried.fluidsFuel.decision, "present");
assert.equal(pendingCarriedDefects(s).length, 0);

// An edited description is kept when the defect is marked fixed.
let e = carryOverDefects(EMPTY_ITEM_STATE, defectsA, new Set());
e = { ...e, failureDescs: { ...e.failureDescs, driveBrakes: "Soft pedal, now grinding" } };
e = decideCarriedDefect(e, "driveBrakes", "fixed");
assert.equal(e.failureDescs.driveBrakes, "Soft pedal, now grinding");

// Plain grid choices on non-carried items do not create carried entries.
const plain = setItem(EMPTY_ITEM_STATE, "equipment", "equipTriangle", true);
assert.equal(plain.equipChecks.equipTriangle, 0);
assert.deepEqual(plain.carried, {});

// Vehicle switch: the old vehicle's untouched carried items revert; hand-set items stay.
let v = carryOverDefects(EMPTY_ITEM_STATE, defectsA, new Set());
const touched = new Set<string>();
touched.add("equipJack");
v = setItem(v, "equipment", "equipJack", true);
v = carryOverDefects(v, [{ kind: "status", key: "visualDoors", description: "Rear door sticks" }], touched);
assert.equal(v.statusRatings.driveBrakes, undefined);
assert.equal(v.failureDescs.driveBrakes, undefined);
assert.equal(v.statusRatings.fluidsFuel, undefined);
assert.equal(v.equipChecks.equipJack, 0); // user's own choice survives
assert.equal(v.statusRatings.visualDoors, "fail");
assert.deepEqual(Object.keys(v.carried), ["visualDoors"]);
// Switching to a vehicle with no defects clears everything carried.
v = carryOverDefects(v, [], touched);
assert.deepEqual(v.carried, {});
assert.equal(v.statusRatings.visualDoors, undefined);

// A defect the user already set by hand is recorded as decided, not pending, and not overwritten.
let h = setItem(EMPTY_ITEM_STATE, "status", "driveBrakes", false);
h = carryOverDefects(h, defectsA.slice(0, 1), new Set(["driveBrakes"]));
assert.equal(h.statusRatings.driveBrakes, "pass");
assert.equal(h.carried.driveBrakes.decision, "fixed");
assert.equal(pendingCarriedDefects(h).length, 0);

// Marker wording.
assert.equal(prefillHintText("mission"), "from mission");
assert.equal(prefillHintText("last_check", "2026-10-01T08:00:00.000Z"), "from last check (2026-10-01)");
assert.equal(prefillHintText("last_check", null), "from last check");
assert.equal(shortDate("2026-10-01 08:00:00"), "2026-10-01");
assert.equal(shortDate(null), "");
assert.equal(
  odometerHintText(52340, "check", "2026-10-01T08:00:00Z"),
  "prefilled with the last recorded reading, 52,340 km (vehicle check, 2026-10-01). Confirm against the gauge."
);
assert.equal(
  odometerHintText(100, null, null),
  "prefilled with the last recorded reading, 100 km. Confirm against the gauge."
);

// Odometer warnings are advisory only.
assert.match(odometerWarning("52000", 52340, false) ?? "", /Lower than the last recorded reading \(52,340 km\)/);
assert.match(odometerWarning("52340", 52340, true) ?? "", /Still the last recorded reading/);
assert.equal(odometerWarning("52340", 52340, false), null); // typed by hand: trust it
assert.equal(odometerWarning("52400", 52340, true), null);
assert.equal(odometerWarning("", 52340, true), null);
assert.equal(odometerWarning("123", null, false), null);

console.log("dvc prefill tests passed");
