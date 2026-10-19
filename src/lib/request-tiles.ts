/**
 * Grouping logic for the /vehicle-requests tile grid (2026-10-19, Matt: "group
 * request types into tiles and have separate modals pop up listing the requests").
 *
 * Client-safe: no DB imports. Pure functions so the grouping, badge counts and
 * deep-link routing can be unit-tested (scripts/test-request-tiles.ts).
 */
import { sortMissionsNewestFirst } from "@/lib/mission-submitted-time";

export type RequestTileKey =
  | "pending_approval"
  | "my_requests"
  | "awaiting_trip"
  | "awaiting_vehicle"
  | "active"
  | "expired"
  | "rejected_withdrawn"
  | "arbitration"
  | "vehicle_requests";

/** Mission tiles in deep-link priority order (first match wins). */
export const MISSION_TILE_ORDER: readonly RequestTileKey[] = [
  "pending_approval",
  "my_requests",
  "awaiting_trip",
  "awaiting_vehicle",
  "active",
  "expired",
  "rejected_withdrawn",
];

export type TileMission = {
  id: string;
  approval_status?: string | null;
  lifecycle_status?: string | null;
  trip_id?: string | null;
  assigned_vehicle_id?: string | null;
  assigned_vehicle_code?: string | null;
  created_at?: string | null;
};

const lc = (v: unknown): string => String(v ?? "").trim().toLowerCase();

export function isLifecycleActive(m: TileMission): boolean {
  const s = lc(m.lifecycle_status);
  return !s || s === "active";
}

/** Requester-side "still open" approval states. */
export function isAwaitingDecision(m: TileMission): boolean {
  const a = lc(m.approval_status);
  return a === "pending" || a === "revision_requested";
}

export function isRejectedOrWithdrawn(m: TileMission): boolean {
  const a = lc(m.approval_status);
  return a === "rejected" || a === "cancelled" || lc(m.lifecycle_status) === "withdrawn";
}

/** Same rule the page used for "Fleet lead: allocate vehicles". */
export function needsVehicleAllocation(m: TileMission): boolean {
  if (!String(m.trip_id || "").trim()) return false;
  const vid = String(m.assigned_vehicle_id || "").trim();
  if (!vid || vid.startsWith("unallocated_")) return true;
  return String(m.assigned_vehicle_code || "").toUpperCase() === "UNALLOCATED";
}

/** Where an *approved* mission belongs. */
export function classifyApprovedMission(
  m: TileMission
): "awaiting_trip" | "awaiting_vehicle" | "active" | "expired" {
  if (!isLifecycleActive(m)) return "expired";
  if (!String(m.trip_id || "").trim()) return "awaiting_trip";
  if (needsVehicleAllocation(m)) return "awaiting_vehicle";
  return "active";
}

function dedupe<T extends TileMission>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export type MissionTileGroups<T extends TileMission> = Record<
  Exclude<RequestTileKey, "arbitration" | "vehicle_requests">,
  T[]
>;

/**
 * Split the page's mission data into tile groups, each newest-first.
 * - pendingForApprover: org-wide pending queue (only shown to approvers)
 * - mine: the signed-in user's missions (createdByMe=true, any approval state)
 * - approvedOrg: org-wide approved missions (any lifecycle)
 * - closedOrg: org-wide rejected / cancelled missions (approvers only; may be empty)
 */
export function buildMissionTileGroups<T extends TileMission>(input: {
  pendingForApprover: readonly T[];
  mine: readonly T[];
  approvedOrg: readonly T[];
  closedOrg?: readonly T[];
  canApprove: boolean;
}): MissionTileGroups<T> {
  const approved = dedupe(input.approvedOrg.filter((m) => lc(m.approval_status || "approved") === "approved"));
  const byClass = (k: ReturnType<typeof classifyApprovedMission>) =>
    sortMissionsNewestFirst(approved.filter((m) => classifyApprovedMission(m) === k));
  return {
    pending_approval: input.canApprove
      ? sortMissionsNewestFirst(dedupe(input.pendingForApprover.filter((m) => lc(m.approval_status || "pending") === "pending")))
      : [],
    my_requests: sortMissionsNewestFirst(
      dedupe(
        input.mine.filter(
          (m) =>
            isLifecycleActive(m) &&
            (isAwaitingDecision(m) || (lc(m.approval_status) === "approved" && !String(m.trip_id || "").trim()))
        )
      )
    ),
    awaiting_trip: byClass("awaiting_trip"),
    awaiting_vehicle: byClass("awaiting_vehicle"),
    active: byClass("active"),
    expired: byClass("expired"),
    rejected_withdrawn: sortMissionsNewestFirst(
      dedupe([...(input.closedOrg ?? []), ...input.mine].filter(isRejectedOrWithdrawn))
    ),
  };
}

/** Badge number on a tile: items that still need someone to act. */
export function tilePendingCount<T extends TileMission>(key: RequestTileKey, rows: readonly T[]): number {
  switch (key) {
    case "pending_approval":
    case "awaiting_vehicle":
      return rows.length;
    case "my_requests":
      return rows.filter(isAwaitingDecision).length;
    default:
      return 0;
  }
}

/** Which tile a deep-linked mission lives in (null if it is in none yet). */
export function tileForMission<T extends TileMission>(
  missionId: string | null | undefined,
  groups: Partial<Record<RequestTileKey, readonly T[]>>
): RequestTileKey | null {
  const id = String(missionId || "").trim();
  if (!id) return null;
  for (const key of MISSION_TILE_ORDER) {
    if (groups[key]?.some((m) => m.id === id)) return key;
  }
  return null;
}

/**
 * Mission id from a /vehicle-requests URL. `?mission=` is used by the approval
 * notification email/WhatsApp; `?highlight=` by /fleet-reservations.
 */
export function deepLinkMissionIdFromParams(params: { get(name: string): string | null }): string | null {
  const raw = params.get("mission") || params.get("highlight") || "";
  const id = raw.trim();
  return id || null;
}

/** DOM id for a mission card inside a tile modal (scroll target for deep links). */
export function missionCardDomId(tile: RequestTileKey, missionId: string): string {
  return tile === "pending_approval" ? `pending-mission-${missionId}` : `mission-card-${tile}-${missionId}`;
}
