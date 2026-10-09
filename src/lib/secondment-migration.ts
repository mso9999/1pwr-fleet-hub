/**
 * One-off backfill for vehicles that an approved `secondment` request moved by changing
 * organization_id (the pre-secondment approve route did that for every kind).
 *
 * For each such vehicle: organization_id goes back to request.from_organization_id and the
 * secondment fields are set from the request. Used by scripts/migrate-secondment-p2-r3.ts;
 * never run on app boot.
 */
import type Database from "better-sqlite3";
import { recordMutation, type MutationActor } from "./record-mutation-log";

export const DEFAULT_SECONDMENT_MIGRATION_CODES = ["P2", "R3"];
export const DEFAULT_SECONDMENT_MIGRATION_ORG = "1pwr_zambia";

export const SECONDMENT_MIGRATION_ACTOR: MutationActor = {
  id: "script:migrate-secondment-p2-r3",
  name: "migrate-secondment-p2-r3",
  role: "system",
  department: "",
};

export type SecondmentMigrationAction = "convert" | "already_migrated" | "skip";

export interface VehicleSecondmentFields {
  organization_id: string;
  seconded_to_org: string | null;
  secondment_start: string | null;
  secondment_expected_return: string | null;
  secondment_request_id: string | null;
}

export interface SecondmentMigrationItem {
  vehicleId: string;
  code: string;
  requestId: string | null;
  action: SecondmentMigrationAction;
  note: string;
  before: VehicleSecondmentFields;
  after: VehicleSecondmentFields | null;
}

export interface SecondmentMigrationOptions {
  /** true = every vehicle with an approved secondment; false = `codes` in `currentOrg` only. */
  allApprovedSecondments?: boolean;
  codes?: string[];
  currentOrg?: string;
}

type VehicleRow = VehicleSecondmentFields & { id: string; code: string };
type RequestRow = {
  id: string;
  vehicle_id: string;
  from_organization_id: string;
  to_organization_id: string;
  effective_date: string | null;
  expected_return_date: string | null;
  updated_at: string;
  created_at: string;
};

function blankToNull(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function fieldsOf(v: VehicleRow): VehicleSecondmentFields {
  return {
    organization_id: v.organization_id,
    seconded_to_org: blankToNull(v.seconded_to_org),
    secondment_start: blankToNull(v.secondment_start),
    secondment_expected_return: blankToNull(v.secondment_expected_return),
    secondment_request_id: blankToNull(v.secondment_request_id),
  };
}

export function hasSecondmentColumns(db: Database.Database): boolean {
  const cols = new Set((db.prepare("PRAGMA table_info(vehicles)").all() as Array<{ name: string }>).map((c) => c.name));
  return ["seconded_to_org", "secondment_start", "secondment_expected_return", "secondment_request_id"].every((c) =>
    cols.has(c)
  );
}

/** Same columns the app's migrateVehicleSecondment adds; idempotent. */
export function ensureSecondmentColumns(db: Database.Database): void {
  const cols = new Set((db.prepare("PRAGMA table_info(vehicles)").all() as Array<{ name: string }>).map((c) => c.name));
  for (const col of ["seconded_to_org", "secondment_start", "secondment_expected_return", "secondment_request_id"]) {
    if (!cols.has(col)) db.exec(`ALTER TABLE vehicles ADD COLUMN ${col} TEXT DEFAULT NULL`);
  }
}

function latestApprovedSecondment(db: Database.Database, vehicleId: string): RequestRow | undefined {
  return db
    .prepare(
      `SELECT id, vehicle_id, from_organization_id, to_organization_id, effective_date, expected_return_date,
              updated_at, created_at
       FROM vehicle_country_change_requests
       WHERE vehicle_id = ? AND change_kind = 'secondment' AND status = 'approved'
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`
    )
    .get(vehicleId) as RequestRow | undefined;
}

function laterOwnershipChange(db: Database.Database, req: RequestRow): { id: string; change_kind: string } | undefined {
  return db
    .prepare(
      `SELECT id, change_kind FROM vehicle_country_change_requests
       WHERE vehicle_id = ? AND status = 'approved' AND change_kind != 'secondment'
         AND updated_at > ?
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(req.vehicle_id, req.updated_at) as { id: string; change_kind: string } | undefined;
}

/** Read-only: what would change. Requires the secondment columns (see ensureSecondmentColumns). */
export function planSecondmentMigration(
  db: Database.Database,
  opts: SecondmentMigrationOptions = {}
): SecondmentMigrationItem[] {
  let vehicles: VehicleRow[];
  const select = `SELECT id, code, organization_id, seconded_to_org, secondment_start,
                         secondment_expected_return, secondment_request_id FROM vehicles`;
  if (opts.allApprovedSecondments) {
    vehicles = db
      .prepare(
        `${select} WHERE id IN (
           SELECT vehicle_id FROM vehicle_country_change_requests
           WHERE change_kind = 'secondment' AND status = 'approved'
         ) ORDER BY code`
      )
      .all() as VehicleRow[];
  } else {
    const codes = (opts.codes ?? DEFAULT_SECONDMENT_MIGRATION_CODES).map((c) => c.toUpperCase());
    const org = opts.currentOrg ?? DEFAULT_SECONDMENT_MIGRATION_ORG;
    vehicles = db
      .prepare(
        `${select} WHERE upper(code) IN (${codes.map(() => "?").join(", ")})
           AND (organization_id = ? OR seconded_to_org = ?) ORDER BY code`
      )
      .all(...codes, org, org) as VehicleRow[];
  }

  return vehicles.map((v): SecondmentMigrationItem => {
    const before = fieldsOf(v);
    const base = { vehicleId: v.id, code: v.code, before };
    const req = latestApprovedSecondment(db, v.id);
    if (!req) {
      return { ...base, requestId: null, action: "skip", note: "no approved secondment request", after: null };
    }
    if (
      before.seconded_to_org === req.to_organization_id &&
      before.organization_id === req.from_organization_id &&
      before.secondment_request_id === req.id
    ) {
      return { ...base, requestId: req.id, action: "already_migrated", note: "already a proper secondment", after: null };
    }
    if (before.seconded_to_org) {
      return {
        ...base,
        requestId: req.id,
        action: "skip",
        note: `already seconded to ${before.seconded_to_org} under another request; left alone`,
        after: null,
      };
    }
    if (before.organization_id !== req.to_organization_id) {
      return {
        ...base,
        requestId: req.id,
        action: "skip",
        note: `organization_id ${before.organization_id} != request to_organization_id ${req.to_organization_id}`,
        after: null,
      };
    }
    const later = laterOwnershipChange(db, req);
    if (later) {
      return {
        ...base,
        requestId: req.id,
        action: "skip",
        note: `superseded by later approved ${later.change_kind} ${later.id}`,
        after: null,
      };
    }
    return {
      ...base,
      requestId: req.id,
      action: "convert",
      note: `${req.from_organization_id} owner, seconded to ${req.to_organization_id}`,
      after: {
        organization_id: req.from_organization_id,
        seconded_to_org: req.to_organization_id,
        secondment_start: blankToNull(req.effective_date),
        secondment_expected_return: blankToNull(req.expected_return_date),
        secondment_request_id: req.id,
      },
    };
  });
}

/** Apply the `convert` items in one transaction, one record_mutation_log row per vehicle. */
export function applySecondmentMigration(
  db: Database.Database,
  items: SecondmentMigrationItem[],
  actor: MutationActor = SECONDMENT_MIGRATION_ACTOR,
  now: string = new Date().toISOString()
): number {
  const update = db.prepare(
    `UPDATE vehicles SET organization_id = ?, seconded_to_org = ?, secondment_start = ?,
       secondment_expected_return = ?, secondment_request_id = ?, updated_at = ?
     WHERE id = ? AND organization_id = ? AND COALESCE(seconded_to_org, '') = ''`
  );
  let changed = 0;
  db.transaction(() => {
    for (const item of items) {
      if (item.action !== "convert" || !item.after) continue;
      const a = item.after;
      const res = update.run(
        a.organization_id,
        a.seconded_to_org,
        a.secondment_start,
        a.secondment_expected_return,
        a.secondment_request_id,
        now,
        item.vehicleId,
        item.before.organization_id
      );
      if (res.changes === 0) continue;
      changed += 1;
      recordMutation(db, {
        entityType: "vehicle",
        entityId: item.vehicleId,
        organizationId: a.organization_id,
        action: "update",
        actor,
        before: { ...item.before },
        after: { ...a },
        reason: `migrate-secondment-p2-r3: vehicle_country_change_request:${a.secondment_request_id}`,
      });
    }
  })();
  return changed;
}
