/**
 * Pending-mission cards: submission date + HH:MM (CAT), newest-first sort, and
 * possible-duplicate hint (2026-10-19 — four near-identical Tiisetso KET cards
 * all showed only "Submitted Oct 19").
 *
 * Run: npx tsx scripts/test-mission-submitted-time.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  countSimilarPendingMissions,
  formatMissionSubmittedAt,
  formatMissionSubmittedShort,
  parseMissionTimestamp,
  possibleDuplicateHint,
  sortMissionsNewestFirst,
} from "../src/lib/mission-submitted-time";

// --- formatting: UTC storage -> CAT (UTC+2) display, independent of host TZ ---
assert.equal(formatMissionSubmittedAt("2026-10-19T11:21:39.551Z"), "19 Oct 2026, 13:21 CAT");
assert.equal(formatMissionSubmittedAt("2026-10-19T08:49:30.657Z"), "19 Oct 2026, 10:49 CAT");
// SQLite datetime('now') form (no zone) is UTC.
assert.equal(formatMissionSubmittedAt("2026-10-19 09:57:31"), "19 Oct 2026, 11:57 CAT");
// Crossing midnight into the next CAT day.
assert.equal(formatMissionSubmittedAt("2026-10-19T22:30:00Z"), "20 Oct 2026, 00:30 CAT");
assert.equal(formatMissionSubmittedShort("2026-10-19T11:18:51.852Z"), "19 Oct 13:18");
assert.equal(formatMissionSubmittedAt(""), "");
assert.equal(formatMissionSubmittedAt(null), "");
assert.equal(formatMissionSubmittedAt("not a date"), "");
assert.equal(parseMissionTimestamp("2026-10-19 09:57:31")?.toISOString(), "2026-10-19T09:57:31.000Z");

// --- the 2026-10-19 incident data (shape only, staff ids anonymised) ---
const incident = [
  { id: "44091477", title: "O@M", created_at: "2026-10-19T08:49:30.657Z", trip_shape: "round_trip", departure_date: "2026-10-19" },
  { id: "5388a737", title: "LPGs delivery to KET", created_at: "2026-10-19T09:57:31.544Z", trip_shape: "round_trip", departure_date: "2026-10-19" },
  { id: "057cdcaa", title: "Delivering LPGs KET", created_at: "2026-10-19T11:18:51.852Z", trip_shape: "one_way", departure_date: "2026-10-19" },
  { id: "016cbece", title: "", created_at: "2026-10-19T11:21:39.551Z", trip_shape: "one_way", departure_date: "2026-10-19" },
].map((m) => ({
  ...m,
  approval_status: "pending",
  created_by_id: "req-1",
  created_by_name: "Requester",
  departure_location: "HQ",
  destination: "KET",
  return_date: "2026-10-20",
}));

// API returns departure_date DESC (ties arbitrary) — UI must reorder newest-first.
const sorted = sortMissionsNewestFirst([incident[1], incident[3], incident[0], incident[2]]);
assert.deepEqual(sorted.map((m) => m.id), ["016cbece", "057cdcaa", "5388a737", "44091477"]);
// Does not mutate the input.
const input = [incident[0], incident[3]];
sortMissionsNewestFirst(input);
assert.deepEqual(input.map((m) => m.id), ["44091477", "016cbece"]);
// Missing timestamps sink to the bottom.
assert.deepEqual(
  sortMissionsNewestFirst([{ id: "x", created_at: "" }, { id: "y", created_at: "2026-10-01T00:00:00Z" }]).map((m) => m.id),
  ["y", "x"]
);

const dup = countSimilarPendingMissions(incident);
for (const m of incident) assert.equal(dup.get(m.id), 3, `${m.id} should match the other 3`);
assert.equal(possibleDuplicateHint(3), "Possible duplicate of 3 other pending requests");
assert.equal(possibleDuplicateHint(1), "Possible duplicate of 1 other pending request");
assert.equal(possibleDuplicateHint(0), "");

// Not duplicates: different requester / destination / origin / dates / non-pending.
const base = incident[0];
const others = [
  { ...base, id: "a", created_by_id: "req-2", created_by_name: "Other" },
  { ...base, id: "b", destination: "MAK" },
  { ...base, id: "c", departure_location: "KET", destination: "KET" },
  { ...base, id: "d", departure_date: "2026-10-25", return_date: "2026-10-26" },
  { ...base, id: "e", approval_status: "approved" },
  { ...base, id: "f", approval_status: "cancelled" },
];
const noDup = countSimilarPendingMissions([base, ...others]);
assert.equal(noDup.has(base.id), false, "no similar pending mission for base");
assert.equal(noDup.size, 0);

// Destination normalisation + blank origin treated as HQ.
const fuzzy = countSimilarPendingMissions([
  { ...base, id: "p", destination: " ket ", departure_location: "" },
  { ...base, id: "q", destination: "KET", departure_location: "hq" },
]);
assert.equal(fuzzy.get("p"), 1);
assert.equal(fuzzy.get("q"), 1);
// Fallback to requester name when id missing.
const byName = countSimilarPendingMissions([
  { ...base, id: "r", created_by_id: "" },
  { ...base, id: "s", created_by_id: "" },
]);
assert.equal(byName.get("r"), 1);

// --- wiring guards on the page/components ---
const root = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/app/vehicle-requests/page.tsx"), "utf8");
const pipeline = fs.readFileSync(path.join(root, "src/components/MissionPipeline.tsx"), "utf8");
assert.match(page, /sortMissionsNewestFirst\(Array\.isArray\(j\) \? j : \[\]\)/, "pending list sorted newest-first");
assert.match(page, /setMyMissions\(sortMissionsNewestFirst\(rows\)\)/, "my requests sorted newest-first");
assert.match(page, /pending-mission-submitted-at/, "pending card shows submitted time");
assert.match(page, /pending-mission-duplicate-hint/, "pending card shows duplicate hint");
assert.match(page, /my-mission-submitted-at/, "my requests show submitted time");
assert.match(page, /my-mission-duplicate-hint/, "my requests show duplicate hint");
assert.match(page, /countSimilarPendingMissions\(pendingMissions\)/);
assert.match(pipeline, /formatMissionSubmittedShort/, "stepper Submitted chip shows HH:MM");

console.log("mission submitted-time tests passed");
