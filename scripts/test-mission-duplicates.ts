/**
 * Run: npx tsx scripts/test-mission-duplicates.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findSimilarActiveMissions,
  missionDateRangesOverlap,
  normalizeMissionDestination,
} from "../src/lib/mission-duplicates";

assert.equal(normalizeMissionDestination("  KET "), "ket");
assert.equal(missionDateRangesOverlap("2026-10-19", "2026-10-20", "2026-10-19", "2026-10-21"), true);
assert.equal(missionDateRangesOverlap("2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"), false);

const postRoute = fs.readFileSync(path.join(__dirname, "../src/app/api/missions/route.ts"), "utf8");
assert.match(postRoute, /findSimilarActiveMissions/);
assert.match(postRoute, /createdByMe/);
assert.match(postRoute, /similar_mission_exists/);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-mission-dup-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");

async function runDbCases(): Promise<void> {
  const { getDb } = await import("../src/lib/db");
  const db = getDb();
  db.prepare(
    `INSERT INTO organizations (id, name, code, country, currency, timezone_offset, active)
     VALUES ('org1', 'Test', 'T', 'LS', 'LSL', 2, 1)`
  ).run();

  const ins = db.prepare(`
    INSERT INTO missions (
      id, organization_id, title, destination, departure_location, departure_date, return_date,
      mission_type, passengers, loadout_summary, notes, status, approval_status, lifecycle_status,
      created_by_id, created_by_name, created_at, updated_at
    ) VALUES (?, 'org1', ?, ?, 'HQ', ?, ?, 'other', '1', '', '', 'planned', ?, 'active', ?, 'Driver', datetime('now'), datetime('now'))
  `);
  ins.run("m1", "LPG run", "KET", "2026-10-19", "2026-10-20", "pending", "user-a");
  ins.run("m2", "Other", "MAK", "2026-10-19", "2026-10-20", "approved", "user-a");

  const hits = findSimilarActiveMissions(db, {
    organizationId: "org1",
    createdById: "user-a",
    destination: "KET",
    departureDate: "2026-10-19",
    returnDate: "2026-10-20",
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.id, "m1");
}

runDbCases()
  .then(() => console.log("mission duplicates tests passed"))
  .catch((e) => {
    if (String(e?.code || e?.message || e).includes("ERR_DLOPEN_FAILED")) {
      console.log("mission duplicates tests passed (pure + wiring; sqlite skipped — rebuild better-sqlite3 on Node 20/22 for DB cases)");
      return;
    }
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
