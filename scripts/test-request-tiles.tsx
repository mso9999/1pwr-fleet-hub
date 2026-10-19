/**
 * /vehicle-requests tile grid + modals (2026-10-19, Matt 14:46 CAT: "group request
 * types into tiles and have separate modals pop up listing the requests").
 *
 * Run: npx tsx scripts/test-request-tiles.tsx
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildMissionTileGroups,
  classifyApprovedMission,
  deepLinkMissionIdFromParams,
  missionCardDomId,
  tileForMission,
  tilePendingCount,
  MISSION_TILE_ORDER,
} from "../src/lib/request-tiles";
import { countSimilarPendingMissions, formatMissionSubmittedAt } from "../src/lib/mission-submitted-time";
import { RequestTile, RequestsGroupModal } from "../src/components/RequestTiles";

type M = {
  id: string;
  title?: string;
  approval_status?: string;
  lifecycle_status?: string;
  trip_id?: string | null;
  assigned_vehicle_id?: string | null;
  assigned_vehicle_code?: string | null;
  created_at?: string;
  created_by_id?: string;
  created_by_name?: string;
  departure_location?: string;
  destination?: string;
  departure_date?: string;
  return_date?: string;
};

// Synthetic copy of the 2026-10-19 incident shape (4 near-identical pending HQ→KET requests).
const req = { created_by_id: "u-req", created_by_name: "Test Requester", departure_location: "HQ", destination: "KET", departure_date: "2026-10-19", return_date: "2026-10-20" };
const pending: M[] = [
  { id: "p-1049", approval_status: "pending", created_at: "2026-10-19T08:49:30.000Z", ...req },
  { id: "p-1157", approval_status: "pending", created_at: "2026-10-19 09:57:31", ...req },
  { id: "p-1318", approval_status: "pending", created_at: "2026-10-19T11:18:51.000Z", ...req },
  { id: "p-1321", approval_status: "pending", created_at: "2026-10-19T11:21:39.000Z", ...req },
];
const approved: M[] = [
  { id: "a-notrip", approval_status: "approved", lifecycle_status: "active", trip_id: null, created_at: "2026-10-10T08:00:00Z" },
  { id: "a-unalloc", approval_status: "approved", lifecycle_status: "active", trip_id: "t1", assigned_vehicle_id: "unallocated_x", created_at: "2026-10-11T08:00:00Z" },
  { id: "a-unalloc2", approval_status: "approved", lifecycle_status: "active", trip_id: "t2", assigned_vehicle_id: "v9", assigned_vehicle_code: "UNALLOCATED", created_at: "2026-10-12T08:00:00Z" },
  { id: "a-active", approval_status: "approved", lifecycle_status: "active", trip_id: "t3", assigned_vehicle_id: "v1", assigned_vehicle_code: "LS-01", created_at: "2026-10-13T08:00:00Z" },
  { id: "a-expired", approval_status: "approved", lifecycle_status: "expired_no_trip", created_at: "2026-09-01T08:00:00Z" },
  { id: "a-deferred", approval_status: "approved", lifecycle_status: "deferred", trip_id: "t4", created_at: "2026-09-02T08:00:00Z" },
];
const mine: M[] = [
  { ...pending[3] },
  { id: "m-revise", approval_status: "revision_requested", lifecycle_status: "active", created_at: "2026-10-18T08:00:00Z" },
  { id: "m-draft", approval_status: "draft", created_at: "2026-10-18T09:00:00Z" },
  { id: "m-approved", approval_status: "approved", lifecycle_status: "active", trip_id: null, created_at: "2026-10-17T08:00:00Z" },
  { id: "m-withdrawn", approval_status: "cancelled", lifecycle_status: "withdrawn", created_at: "2026-10-16T08:00:00Z" },
];
const closed: M[] = [
  { id: "c-rejected", approval_status: "rejected", created_at: "2026-10-15T08:00:00Z" },
  { id: "m-withdrawn", approval_status: "cancelled", lifecycle_status: "withdrawn", created_at: "2026-10-16T08:00:00Z" },
];

// --- classification ---
assert.equal(classifyApprovedMission(approved[0]), "awaiting_trip");
assert.equal(classifyApprovedMission(approved[1]), "awaiting_vehicle");
assert.equal(classifyApprovedMission(approved[2]), "awaiting_vehicle");
assert.equal(classifyApprovedMission(approved[3]), "active");
assert.equal(classifyApprovedMission(approved[4]), "expired");
assert.equal(classifyApprovedMission(approved[5]), "expired", "non-active lifecycle wins over trip state");

// --- grouping (approver) ---
const g = buildMissionTileGroups({ pendingForApprover: pending, mine, approvedOrg: approved, closedOrg: closed, canApprove: true });
assert.deepEqual(g.pending_approval.map((m) => m.id), ["p-1321", "p-1318", "p-1157", "p-1049"], "pending newest first");
assert.deepEqual(g.my_requests.map((m) => m.id), ["p-1321", "m-revise", "m-approved"], "drafts / withdrawn excluded; newest first");
assert.deepEqual(g.awaiting_trip.map((m) => m.id), ["a-notrip"]);
assert.deepEqual(g.awaiting_vehicle.map((m) => m.id), ["a-unalloc2", "a-unalloc"]);
assert.deepEqual(g.active.map((m) => m.id), ["a-active"]);
assert.deepEqual(g.expired.map((m) => m.id), ["a-deferred", "a-expired"]);
assert.deepEqual(g.rejected_withdrawn.map((m) => m.id), ["m-withdrawn", "c-rejected"], "deduped across org + mine");

// --- grouping (non-approver): no approver queue, rejected list = own only ---
const g2 = buildMissionTileGroups({ pendingForApprover: pending, mine, approvedOrg: approved, canApprove: false });
assert.equal(g2.pending_approval.length, 0);
assert.deepEqual(g2.rejected_withdrawn.map((m) => m.id), ["m-withdrawn"]);

// --- badges ---
assert.equal(tilePendingCount("pending_approval", g.pending_approval), 4);
assert.equal(tilePendingCount("my_requests", g.my_requests), 2, "pending + revision_requested, not approved");
assert.equal(tilePendingCount("awaiting_vehicle", g.awaiting_vehicle), 2);
assert.equal(tilePendingCount("expired", g.expired), 0);
assert.equal(tilePendingCount("rejected_withdrawn", g.rejected_withdrawn), 0);

// --- deep links ---
const params = (q: string) => new URLSearchParams(q);
assert.equal(deepLinkMissionIdFromParams(params("mission=p-1157")), "p-1157");
assert.equal(deepLinkMissionIdFromParams(params("highlight=a-active")), "a-active");
assert.equal(deepLinkMissionIdFromParams(params("mission=%20")), null);
assert.equal(deepLinkMissionIdFromParams(params("newMission=1")), null);
assert.equal(tileForMission("p-1321", g), "pending_approval", "approver's own pending mission opens the approval tile first");
assert.equal(tileForMission("p-1321", g2), "my_requests", "requester lands in My requests");
assert.equal(tileForMission("a-unalloc", g), "awaiting_vehicle");
assert.equal(tileForMission("a-expired", g), "expired");
assert.equal(tileForMission("c-rejected", g), "rejected_withdrawn");
assert.equal(tileForMission("nope", g), null);
assert.equal(tileForMission(null, g), null);
assert.equal(MISSION_TILE_ORDER[0], "pending_approval");
assert.equal(missionCardDomId("pending_approval", "abc"), "pending-mission-abc", "keeps the pre-redesign anchor id");
assert.equal(missionCardDomId("expired", "abc"), "mission-card-expired-abc");

// --- duplicate hint on the incident set + CAT times ---
const dup = countSimilarPendingMissions(g.pending_approval);
for (const m of pending) assert.equal(dup.get(m.id), 3);
assert.equal(formatMissionSubmittedAt(g.pending_approval[0].created_at), "19 Oct 2026, 13:21 CAT");

// --- components render (server markup) ---
const tileHtml = renderToStaticMarkup(
  React.createElement(RequestTile, { tileKey: "pending_approval", label: "Pending my approval", count: 4, pendingCount: 4, tone: "amber", onOpen: () => {} })
);
assert.match(tileHtml, /data-testid="request-tile-pending_approval"/);
assert.match(tileHtml, /data-testid="request-tile-badge-pending_approval"[^>]*>4</);
assert.match(tileHtml, /aria-haspopup="dialog"/);
assert.match(tileHtml, /min-h-\[88px\]/, "tap target large enough on mobile");
const emptyTile = renderToStaticMarkup(React.createElement(RequestTile, { tileKey: "expired", label: "Expired", count: 0, onOpen: () => {} }));
assert.doesNotMatch(emptyTile, /request-tile-badge/, "no badge when nothing is pending");

const modalHtml = renderToStaticMarkup(
  <RequestsGroupModal tileKey="pending_approval" title="Pending my approval (4)" onClose={() => {}}>
    <p>body</p>
  </RequestsGroupModal>
);
assert.match(modalHtml, /role="dialog"/);
assert.match(modalHtml, /aria-modal="true"/);
assert.match(modalHtml, /h-full w-full[^"]*sm:max-w-3xl/, "full-screen sheet on phones, dialog from sm up");
assert.match(modalHtml, /aria-label="Close"/);
assert.match(modalHtml, /overflow-y-auto/);

// --- page wiring guards ---
const page = fs.readFileSync(path.join(__dirname, "../src/app/vehicle-requests/page.tsx"), "utf8");
assert.match(page, /data-testid="request-tiles"/, "tile grid rendered");
assert.match(page, /grid-cols-2 gap-2 sm:grid-cols-3/, "2-column grid on phones");
assert.match(page, /<RequestsGroupModal/, "tiles open a modal");
assert.match(page, /buildMissionTileGroups\(\{/);
assert.match(page, /deepLinkMissionIdFromParams\(searchParams\)/, "?mission= and ?highlight= deep links");
assert.match(page, /tileForMission\(deepLinkMissionId, missionGroups\)/, "deep link opens the right tile");
assert.match(page, /setExpandedMissionId\(deepLinkMissionId\)/, "deep-linked mission expanded");
assert.match(page, /canApproveMission && !pendingLoaded/, "deep link waits for the approver queue");
assert.match(page, /onApprove=\{\(id\) => patchMissionApproval\(id, "approve"\)\}/, "approve wired inside modal");
assert.match(page, /onRevise=\{\(id\) => patchMissionApproval\(id, "revise"\)\}/);
assert.match(page, /onReject=\{\(id\) => patchMissionApproval\(id, "reject"\)\}/);
assert.match(page, /closeOnEscape=\{!detailRequest\}/, "Escape closes request details before the group modal");
assert.doesNotMatch(page, /min-w-\[1000px\]/, "no 1000px-wide table (mobile)");
assert.doesNotMatch(page, /Missions pending management approval<\/CardTitle>/, "old stacked section removed");

console.log("request tiles tests passed");
