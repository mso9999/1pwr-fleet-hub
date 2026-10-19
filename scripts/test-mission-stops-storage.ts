/**
 * Run: npx tsx scripts/test-mission-stops-storage.ts
 */
import assert from "node:assert/strict";
import { buildStoredMissionStops, TRIP_SHAPES } from "../src/lib/trip-route";

const round = buildStoredMissionStops({
  tripShape: TRIP_SHAPES.ROUND_TRIP,
  originLabel: "HQ",
  destination: "KET",
  waypoints: [],
  originLat: null,
  originLng: null,
});
assert.equal(round.length, 1);
assert.equal(round[0]?.location, "HQ");
assert.equal(round[0]?.notes, "Return leg");
assert.equal(
  round.some((s) => s.location === "KET"),
  false,
  "destination must not be duplicated as a stop when stored on missions.destination"
);

const multi = buildStoredMissionStops({
  tripShape: TRIP_SHAPES.MULTI_STOP,
  originLabel: "HQ",
  destination: "KET",
  waypoints: [{ location: "MAK", loadOut: "", loadIn: "", notes: "" }],
});
assert.deepEqual(
  multi.map((s) => s.location),
  ["MAK", "KET"]
);

console.log("mission stops storage tests passed");
