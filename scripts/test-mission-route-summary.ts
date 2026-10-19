/**
 * Run: npx tsx scripts/test-mission-route-summary.ts
 */
import assert from "node:assert/strict";
import { formatMissionRouteSummary } from "../src/lib/mission-route-summary";

assert.equal(
  formatMissionRouteSummary({
    departureLocation: "HQ",
    destination: "KET",
    stops: [
      { location: "KET", stop_order: 1 },
      { location: "HQ", stop_order: 2 },
    ],
  }),
  "HQ → KET → HQ",
  "legacy rows with dest duplicated in stops"
);

assert.equal(
  formatMissionRouteSummary({
    departureLocation: "HQ",
    destination: "KET",
    stops: [{ location: "HQ", stop_order: 1 }],
  }),
  "HQ → KET → HQ",
  "new storage: remote end in missions.destination, return leg in stops"
);

assert.equal(
  formatMissionRouteSummary({
    departureLocation: "HQ",
    destination: "KET",
    stops: [],
  }),
  "HQ → KET"
);

const oldNotifierConcat = ["HQ", "KET", "HQ", "KET"].join(" → ");
const fixed = formatMissionRouteSummary({
  departureLocation: "HQ",
  destination: "KET",
  stops: [
    { location: "KET", stop_order: 1 },
    { location: "HQ", stop_order: 2 },
  ],
});
assert.notEqual(fixed, oldNotifierConcat);

console.log("mission route summary tests passed");
