import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

/**
 * Shared append-only audit log shared across sensitive records (fleet mechanics, EHS
 * approved drivers, future regulatory registers). Every create / update / delete /
 * attestation writes one row here with actor context and before / after snapshots.
 *
 * Log rows are never mutated after they are written.
 */

export type MutationAction =
  | "create"
  | "update"
  | "delete"
  | "attest"
  | "authorization"
  | "prerequisite_override"
  | "mission_lifecycle"
  | "mission_reopened_approval"
  | "status_sync"
  | "sync_conflict"
  | "mission_checkout_hold"
  | "reservation_overlap_override"
  | "registration_disc_reservation_override"
  | "registration_disc_assign_override"
  | "checkin"
  | "approve"
  | "reject"
  | "admin_config";

export type MutationEntityType =
  | "fleet_mechanic"
  | "ehs_approved_driver"
  | "trip"
  | "vehicle_request"
  | "vehicle_country_change_request"
  | "mission"
  | "vehicle"
  | "work_order"
  | "inspection"
  | "driver_vehicle_check"
  | "field_report"
  | "scheduled_maintenance"
  | "post_deployment_check"
  | "personal_vehicle_reimbursement_request"
  | "organization"
  | "reference_data"
  | "media_attachment";

export interface MutationActor {
  id: string;
  name: string;
  role: string;
  department: string;
}

export interface RecordMutationInput {
  entityType: MutationEntityType;
  entityId: string;
  organizationId: string;
  action: MutationAction;
  actor: MutationActor;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string;
}

export interface RecordMutationRow {
  id: string;
  entity_type: string;
  entity_id: string;
  organization_id: string;
  action: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  actor_department: string;
  before_json: string;
  after_json: string;
  reason: string;
  created_at: string;
}

function safeJson(v: Record<string, unknown> | null | undefined): string {
  if (!v) return "{}";
  try {
    return JSON.stringify(v);
  } catch {
    return "{}";
  }
}

/**
 * Append one mutation log entry. Never throws on write (audit never blocks the user's
 * main action); DB-level failures are logged so operators can follow up.
 */
export function recordMutation(db: Database.Database, input: RecordMutationInput): void {
  try {
    db.prepare(
      `INSERT INTO record_mutation_log (
        id, entity_type, entity_id, organization_id, action,
        actor_id, actor_name, actor_role, actor_department,
        before_json, after_json, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      uuidv4(),
      input.entityType,
      input.entityId,
      input.organizationId || "",
      input.action,
      input.actor.id || "",
      input.actor.name || "",
      input.actor.role || "",
      input.actor.department || "",
      safeJson(input.before),
      safeJson(input.after),
      input.reason || ""
    );
  } catch (err) {
    console.error("[record-mutation-log] insert failed", err);
  }
}

/**
 * Read the history for a single entity (newest first).
 */
export function listMutations(
  db: Database.Database,
  entityType: MutationEntityType,
  entityId: string,
  limit = 100
): RecordMutationRow[] {
  return db
    .prepare(
      `SELECT * FROM record_mutation_log
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(entityType, entityId, limit) as RecordMutationRow[];
}

/**
 * Convenience: build an actor from a VerifiedFleetUser (or similar).
 */
export function actorFrom(user: {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  department?: string;
}): MutationActor {
  return {
    id: user.id || "",
    name: user.name || user.email || "",
    role: user.role || "",
    department: user.department || "",
  };
}

/**
 * Compute a field-level diff (before vs after) for compact audit-trail display. Keys that
 * exist in either side are included. Unchanged keys are skipped. Great for the UI so we
 * don't re-render the full JSON for small edits.
 */
export function diffRecords(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set<string>();
  if (before) Object.keys(before).forEach((k) => keys.add(k));
  if (after) Object.keys(after).forEach((k) => keys.add(k));
  for (const k of keys) {
    const b = before ? before[k] : undefined;
    const a = after ? after[k] : undefined;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      out[k] = { before: b, after: a };
    }
  }
  return out;
}
