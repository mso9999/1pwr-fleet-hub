/**
 * Run: npx tsx scripts/test-registration-disc.ts
 */
import assert from "node:assert/strict";
import {
  calendarDaysUntil,
  missionWindowEndDate,
  normalizeCalendarDay,
  registrationDiscDashboardTier,
  registrationDiscMissionBlocked,
} from "../src/lib/registration-disc";

assert.equal(normalizeCalendarDay("  2026-03-15T00:00:00  "), "2026-03-15");
assert.equal(missionWindowEndDate("2026-05-01", ""), "2026-05-01");
assert.equal(missionWindowEndDate("2026-05-01", "2026-05-10"), "2026-05-10");

assert.equal(registrationDiscMissionBlocked("2026-05-10", "2026-05-10"), false);
assert.equal(registrationDiscMissionBlocked("2026-05-10", "2026-05-09"), true);
assert.equal(registrationDiscMissionBlocked("2026-05-10", null), false);

assert.equal(calendarDaysUntil("2026-05-01", "2026-05-31"), 30);
assert.equal(calendarDaysUntil("2026-05-01", "2026-04-30"), -1);

assert.equal(registrationDiscDashboardTier("2026-05-01", "2026-07-01"), null);
assert.equal(registrationDiscDashboardTier("2026-05-01", "2026-06-30"), "within_60");
assert.equal(registrationDiscDashboardTier("2026-05-01", "2026-06-15"), "within_60");
assert.equal(registrationDiscDashboardTier("2026-05-01", "2026-05-20"), "within_30");
assert.equal(registrationDiscDashboardTier("2026-05-01", "2026-04-01"), "expired");

console.log("registration-disc helpers OK");
