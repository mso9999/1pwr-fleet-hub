#!/usr/bin/env tsx
/**
 * Approved missions with no trip: reminder / expiry rules. Run: npx tsx scripts/test-stale-no-trip.ts
 */
import assert from "node:assert/strict";
import { decideNoTrip } from "../src/lib/stale-no-trip";

const day = (iso: string) => new Date(`${iso}T06:30:00Z`);
const since = day("2026-01-01");

assert.deepEqual(decideNoTrip({ now: day("2026-01-07"), since, warnedStage: 0, warnedAt: null }), { kind: "none" });
assert.deepEqual(decideNoTrip({ now: day("2026-01-08"), since, warnedStage: 0, warnedAt: null }), {
  kind: "warn",
  stage: 1,
  daysLeft: 7,
});
assert.deepEqual(
  decideNoTrip({ now: day("2026-01-10"), since, warnedStage: 1, warnedAt: day("2026-01-08") }),
  { kind: "none" },
);
assert.deepEqual(
  decideNoTrip({ now: day("2026-01-12"), since, warnedStage: 1, warnedAt: day("2026-01-08") }),
  { kind: "warn", stage: 2, daysLeft: 3 },
);
assert.deepEqual(
  decideNoTrip({ now: day("2026-01-14"), since, warnedStage: 2, warnedAt: day("2026-01-12") }),
  { kind: "warn", stage: 3, daysLeft: 1 },
);
assert.deepEqual(
  decideNoTrip({ now: day("2026-01-15"), since, warnedStage: 3, warnedAt: day("2026-01-14") }),
  { kind: "expire" },
);
// Backlog: past 14 days with no warning gets a final notice first, then expires a day later.
assert.deepEqual(decideNoTrip({ now: day("2026-03-01"), since, warnedStage: 0, warnedAt: null }), {
  kind: "warn",
  stage: 3,
  daysLeft: 0,
});
assert.deepEqual(
  decideNoTrip({ now: day("2026-03-01"), since, warnedStage: 3, warnedAt: day("2026-03-01") }),
  { kind: "none" },
);
assert.deepEqual(
  decideNoTrip({ now: day("2026-03-02"), since, warnedStage: 3, warnedAt: day("2026-03-01") }),
  { kind: "expire" },
);
// Reactivation restarts the clock: an old warning no longer counts.
const reactivated = day("2026-03-10");
assert.deepEqual(
  decideNoTrip({ now: day("2026-03-12"), since: reactivated, warnedStage: 3, warnedAt: day("2026-03-01") }),
  { kind: "none" },
);
assert.deepEqual(
  decideNoTrip({ now: day("2026-03-17"), since: reactivated, warnedStage: 3, warnedAt: day("2026-03-01") }),
  { kind: "warn", stage: 1, daysLeft: 7 },
);
// Skipped daily runs jump straight to the stage that is due.
assert.deepEqual(decideNoTrip({ now: day("2026-01-13"), since, warnedStage: 0, warnedAt: null }), {
  kind: "warn",
  stage: 2,
  daysLeft: 2,
});

console.log("All stale no-trip tests passed.");
