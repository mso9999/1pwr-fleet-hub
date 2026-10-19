/**
 * Guards mission-approval UX on /vehicle-requests (2026-10-19 incident).
 *
 * Run: npx tsx scripts/test-pending-mission-approval-ui.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/app/vehicle-requests/page.tsx"), "utf8");
const overlay = fs.readFileSync(path.join(root, "src/components/tutorial/TutorialOverlay.tsx"), "utf8");
const actions = fs.readFileSync(path.join(root, "src/components/PendingMissionApprovalActions.tsx"), "utf8");
const boundary = fs.readFileSync(path.join(root, "src/components/PendingMissionDetailsBoundary.tsx"), "utf8");

// Root cause fix: expanding a row must not re-trigger the pending-missions fetch (was in effect deps).
assert.doesNotMatch(
  page,
  /\[organizationId,\s*canApproveMission,\s*expandedPendingMissionId\]/,
  "pending list fetch must not depend on expandedPendingMissionId"
);
assert.match(page, /PendingMissionApprovalActions/, "collapsed-row approval actions");
assert.match(page, /PendingMissionDetailsBoundary/, "error boundary around expanded details");
assert.match(actions, /window\.confirm/, "approve requires explicit confirm from collapsed row");

// Tutorial must not capture clicks on the highlighted queue (mission approval tour steps 2–3).
assert.match(overlay, /fixed inset-0 z-\[200\] pointer-events-none/);
assert.doesNotMatch(
  overlay,
  /fixed inset-0 z-\[200\] pointer-events-auto/,
  "tutorial overlay must not block page clicks"
);

assert.match(boundary, /getDerivedStateFromError/);

console.log("pending mission approval UI tests passed");
