/**
 * Run: npx tsx scripts/test-mission-requester-actions.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const patchRoute = fs.readFileSync(path.join(__dirname, "../src/app/api/missions/[id]/route.ts"), "utf8");
assert.match(patchRoute, /action === "withdraw"/);
assert.match(patchRoute, /currentApproval === "pending"/);
assert.match(patchRoute, /currentApproval === "revision_requested"/);
assert.match(patchRoute, /approval_status = 'cancelled'/);
assert.match(patchRoute, /notifyMissionApproversOfSubmission\(db, id, "updated"\)/);

const page = fs.readFileSync(path.join(__dirname, "../src/app/vehicle-requests/page.tsx"), "utf8");
assert.match(page, /createdByMe=true/);
assert.match(page, /data-testid="my-mission-requests"/);
assert.match(page, /buildStoredMissionStops/);
assert.match(page, /withdrawMyMission/);
assert.match(page, /acknowledgeSimilarMission/);

const notify = fs.readFileSync(path.join(__dirname, "../src/lib/mission-approval-notify.ts"), "utf8");
assert.match(notify, /formatMissionRouteSummary/);

console.log("mission requester actions tests passed");
