/**
 * One mission normally has one vehicle request. A second submit for the same
 * mission is usually someone starting over, so it is held until the submitter
 * says what they meant: replace the open request, or file a genuinely separate
 * one with a reason.
 */
import type Database from "better-sqlite3";
import { recordMutation, type MutationActor } from "@/lib/record-mutation-log";

export const SEPARATE_REASON_MIN = 8;
export const SUPERSEDE_REASON = "Superseded by a new vehicle request.";

export type OpenRequestResolution = "supersede" | "separate";

export interface OpenMissionRequest {
  id: string;
  purpose: string;
  status: string;
  createdAt: string;
  requestedById: string;
  requestedByName: string;
  assignedVehicleCode: string | null;
  /** True once fleet has put a vehicle on it; such a request is no longer editable by the requestor. */
  allocated: boolean;
}

export function isAllocated(row: { status?: unknown; assigned_vehicle_id?: unknown }): boolean {
  const vehicle = String(row.assigned_vehicle_id ?? "").trim();
  return String(row.status ?? "").toLowerCase() === "assigned" || (vehicle !== "" && !vehicle.startsWith("unallocated_"));
}

/** Fields the requestor collects on the form and may change until a vehicle is allocated. */
export const REQUESTOR_EDITABLE_KEYS = [
  "purpose",
  "passengers",
  "requiredVehicleClass",
  "loadoutDescription",
  "priority",
  "notes",
  "requestedFor",
  "designatedOperatorId",
];

export function requestorMayEditRequest(
  row: { requested_by_id?: unknown; status?: unknown; assigned_vehicle_id?: unknown },
  userId: string,
  keys: string[],
): boolean {
  return (
    String(row.requested_by_id ?? "") === userId &&
    userId !== "" &&
    ["requested", "approved"].includes(String(row.status ?? "").toLowerCase()) &&
    !isAllocated(row) &&
    keys.length > 0 &&
    keys.every((k) => REQUESTOR_EDITABLE_KEYS.includes(k))
  );
}

export function findOpenMissionRequests(db: Database.Database, missionId: string): OpenMissionRequest[] {
  if (!missionId.trim()) return [];
  const rows = db
    .prepare(
      `SELECT vr.id, vr.purpose, vr.status, vr.created_at, vr.requested_by_id, vr.requested_by_name,
              vr.assigned_vehicle_id, v.code AS assigned_vehicle_code
       FROM vehicle_requests vr
       LEFT JOIN vehicles v ON v.id = vr.assigned_vehicle_id
       WHERE vr.mission_id = ? AND lower(vr.status) IN ('requested', 'approved', 'assigned')
       ORDER BY vr.created_at ASC`,
    )
    .all(missionId) as Array<Record<string, string | null>>;
  return rows.map((row) => ({
    id: String(row.id),
    purpose: String(row.purpose || ""),
    status: String(row.status || ""),
    createdAt: String(row.created_at || ""),
    requestedById: String(row.requested_by_id || ""),
    requestedByName: String(row.requested_by_name || ""),
    assignedVehicleCode: row.assigned_vehicle_code ? String(row.assigned_vehicle_code) : null,
    allocated: isAllocated(row),
  }));
}

export type InsertDecision =
  | { ok: true; supersedeIds: string[]; separateReason: string | null }
  | { ok: false; status: number; body: Record<string, unknown> };

/** Decide whether a new mission-linked request may be inserted, given the requests already open on that mission. */
export function decideMissionRequestInsert(
  open: OpenMissionRequest[],
  resolution: string | null | undefined,
  separateReason: string | null | undefined,
): InsertDecision {
  if (open.length === 0) return { ok: true, supersedeIds: [], separateReason: null };

  if (resolution === "supersede") {
    const replaceable = open.filter((r) => !r.allocated);
    if (replaceable.length === 0) {
      return {
        ok: false,
        status: 409,
        body: {
          code: "open_request_allocated",
          error:
            "Fleet has already put a vehicle on this mission's request, so it cannot be replaced by starting over. File a separate request with a reason if a second vehicle is needed.",
          requests: open,
        },
      };
    }
    return { ok: true, supersedeIds: replaceable.map((r) => r.id), separateReason: null };
  }

  if (resolution === "separate") {
    const reason = String(separateReason ?? "").trim();
    if (reason.length < SEPARATE_REASON_MIN) {
      return {
        ok: false,
        status: 400,
        body: {
          code: "separate_reason_required",
          error: `Say why this is a separate request (at least ${SEPARATE_REASON_MIN} characters), for example "second vehicle for the crew".`,
        },
      };
    }
    return { ok: true, supersedeIds: [], separateReason: reason };
  }

  return {
    ok: false,
    status: 409,
    body: {
      code: "open_request_exists",
      error: "This mission already has a vehicle request. Resume it, replace it, or confirm this is a separate request.",
      requests: open,
    },
  };
}

export function supersedeRequests(
  db: Database.Database,
  ids: string[],
  organizationId: string,
  actor: MutationActor,
  nowIso: string,
): void {
  const update = db.prepare(
    `UPDATE vehicle_requests SET status = 'cancelled', rejection_reason = ?, updated_at = ?
     WHERE id = ? AND lower(status) IN ('requested', 'approved')
       AND (trim(COALESCE(assigned_vehicle_id, '')) = '' OR assigned_vehicle_id LIKE 'unallocated_%')`,
  );
  for (const id of ids) {
    if (update.run(SUPERSEDE_REASON, nowIso, id).changes !== 1) continue;
    recordMutation(db, {
      entityType: "vehicle_request",
      entityId: id,
      organizationId,
      action: "allocation_cancel",
      actor,
      reason: SUPERSEDE_REASON,
      after: { status: "cancelled" },
    });
  }
}
