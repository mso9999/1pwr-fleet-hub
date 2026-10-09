/**
 * Vehicle secondment: a vehicle lent to another country without changing its owner.
 *
 * Owner = vehicles.organization_id (never changed by a secondment).
 * Borrower + window = vehicles.seconded_to_org / secondment_start /
 * secondment_expected_return (NULL = open-ended) / secondment_request_id.
 *
 * Approving a `secondment` country-change request starts one; POST
 * /api/vehicles/[id]/secondment/return ends it. data_correction and permanent_transfer
 * still move organization_id (and end any active secondment).
 */
import type Database from "better-sqlite3";
import { recordMutation, type MutationActor } from "./record-mutation-log";
import { isVehicleSeconded } from "./vehicle-org-scope";

export interface SecondmentState {
  seconded_to_org: string | null;
  secondment_start: string | null;
  secondment_expected_return: string | null;
  secondment_request_id: string | null;
}

const CLEARED: SecondmentState = {
  seconded_to_org: null,
  secondment_start: null,
  secondment_expected_return: null,
  secondment_request_id: null,
};

function nullable(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s ? s : null;
}

export function secondmentSnapshot(row: Record<string, unknown>): SecondmentState {
  return {
    seconded_to_org: nullable(row.seconded_to_org),
    secondment_start: nullable(row.secondment_start),
    secondment_expected_return: nullable(row.secondment_expected_return),
    secondment_request_id: nullable(row.secondment_request_id),
  };
}

/** Country code (organizations.country) for badges and messages; falls back to the org id. */
export function orgCountryCode(db: Database.Database, orgId: string | null | undefined): string {
  if (!orgId) return "";
  const row = db.prepare("SELECT country FROM organizations WHERE id = ?").get(orgId) as
    | { country?: string }
    | undefined;
  return String(row?.country || "").trim() || orgId;
}

/**
 * A vehicle that is already seconded may not start another secondment, nor be
 * "corrected" to another owner mid-secondment. A permanent transfer is allowed and
 * ends the secondment on approval.
 */
export function countryChangeBlockedBySecondment(
  vehicle: Record<string, unknown>,
  kind: string,
  secondedToLabel?: string
): string | null {
  if (!isVehicleSeconded(vehicle)) return null;
  if (kind === "permanent_transfer") return null;
  const to = secondedToLabel || String(vehicle.seconded_to_org);
  const since = nullable(vehicle.secondment_start);
  const where = `${String(vehicle.code || "This vehicle")} is already seconded to ${to}${since ? ` since ${since}` : ""}.`;
  return kind === "secondment"
    ? `${where} Record its return before requesting a new secondment.`
    : `${where} Record its return before changing its owning country.`;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Expected return may be blank (open-ended). If given it must be a date on or after the start. */
export function validateSecondmentDates(effectiveDate: string, expectedReturnDate: string): string | null {
  if (!YMD.test(effectiveDate)) return "effectiveDate must be a date (YYYY-MM-DD)";
  if (!expectedReturnDate) return null;
  if (!YMD.test(expectedReturnDate)) return "expectedReturnDate must be a date (YYYY-MM-DD) or blank for open-ended";
  if (expectedReturnDate < effectiveDate) return "expectedReturnDate cannot be before effectiveDate";
  return null;
}

function writeSecondment(db: Database.Database, vehicleId: string, s: SecondmentState, now: string): void {
  db.prepare(
    `UPDATE vehicles SET seconded_to_org = ?, secondment_start = ?, secondment_expected_return = ?,
       secondment_request_id = ?, updated_at = ? WHERE id = ?`
  ).run(
    s.seconded_to_org,
    s.secondment_start,
    s.secondment_expected_return,
    s.secondment_request_id,
    now,
    vehicleId
  );
}

/** Approve path for kind = secondment: owner unchanged, secondment fields set. */
export function applySecondmentStart(
  db: Database.Database,
  input: {
    vehicleId: string;
    requestId: string;
    toOrganizationId: string;
    effectiveDate: string;
    expectedReturnDate: string;
    actor: MutationActor;
    now: string;
  }
): { before: SecondmentState; after: SecondmentState } {
  const row = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(input.vehicleId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error(`vehicle ${input.vehicleId} not found`);
  const before = secondmentSnapshot(row);
  const after: SecondmentState = {
    seconded_to_org: input.toOrganizationId,
    secondment_start: nullable(input.effectiveDate) ?? input.now.slice(0, 10),
    secondment_expected_return: nullable(input.expectedReturnDate),
    secondment_request_id: input.requestId,
  };
  writeSecondment(db, input.vehicleId, after, input.now);
  recordMutation(db, {
    entityType: "vehicle",
    entityId: input.vehicleId,
    organizationId: String(row.organization_id ?? ""),
    action: "update",
    actor: input.actor,
    before: { organization_id: row.organization_id, ...before },
    after: { organization_id: row.organization_id, ...after },
    reason: `vehicle_country_change_request:${input.requestId}`,
  });
  return { before, after };
}

/** Approve path for data_correction / permanent_transfer: owner moves; any active secondment ends. */
export function applyOwnershipMove(
  db: Database.Database,
  input: { vehicleId: string; requestId: string; toOrganizationId: string; actor: MutationActor; now: string }
): void {
  const row = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(input.vehicleId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error(`vehicle ${input.vehicleId} not found`);
  const fromOrg = String(row.organization_id ?? "");
  const wasSeconded = isVehicleSeconded(row);
  db.prepare("UPDATE vehicles SET organization_id = ?, updated_at = ? WHERE id = ?").run(
    input.toOrganizationId,
    input.now,
    input.vehicleId
  );
  if (wasSeconded) writeSecondment(db, input.vehicleId, CLEARED, input.now);
  recordMutation(db, {
    entityType: "vehicle",
    entityId: input.vehicleId,
    organizationId: input.toOrganizationId,
    action: "update",
    actor: input.actor,
    before: wasSeconded
      ? { organization_id: fromOrg, ...secondmentSnapshot(row) }
      : { organization_id: fromOrg },
    after: wasSeconded
      ? { organization_id: input.toOrganizationId, ...CLEARED }
      : { organization_id: input.toOrganizationId },
    reason: `vehicle_country_change_request:${input.requestId}`,
  });
}

/**
 * Mark a pending country-change request approved and apply it to the vehicle.
 * A secondment lends the vehicle (owner unchanged); the other kinds move the owner.
 * Call inside a transaction.
 */
export function applyApprovedCountryChangeRequest(
  db: Database.Database,
  requestId: string,
  request: Record<string, unknown>,
  actor: MutationActor,
  signerId: string,
  signerName: string,
  now: string,
  opts: { kind: "fleet" | "executive" }
): void {
  const vehicleId = String(request.vehicle_id);
  const toOrganizationId = String(request.to_organization_id);
  const reviewedId = opts.kind === "fleet" ? signerId : "";
  const reviewedName = opts.kind === "fleet" ? signerName : "";
  const reviewedAt = opts.kind === "fleet" ? now : "";
  const execId = opts.kind === "executive" ? signerId : "";
  const execName = opts.kind === "executive" ? signerName : "";
  const execAt = opts.kind === "executive" ? now : "";

  db.prepare(
    `UPDATE vehicle_country_change_requests SET
      status = 'approved',
      updated_at = ?,
      reviewed_by_id = ?,
      reviewed_by_name = ?,
      reviewed_at = ?,
      executive_signed_by_id = ?,
      executive_signed_by_name = ?,
      executive_signed_at = ?
    WHERE id = ?`
  ).run(now, reviewedId, reviewedName, reviewedAt, execId, execName, execAt, requestId);

  if (request.change_kind === "secondment") {
    applySecondmentStart(db, {
      vehicleId,
      requestId,
      toOrganizationId,
      effectiveDate: String(request.effective_date ?? ""),
      expectedReturnDate: String(request.expected_return_date ?? ""),
      actor,
      now,
    });
  } else {
    applyOwnershipMove(db, { vehicleId, requestId, toOrganizationId, actor, now });
  }
}

export type ReturnSecondmentResult =
  | {
      ok: true;
      before: SecondmentState;
      /** Active reservations the borrower still holds on this vehicle from today on (not cancelled). */
      borrowerReservationsAfterReturn: number;
    }
  | { ok: false; status: number; error: string };

/** End an active secondment: clear the four fields and log it. Owner is untouched. */
export function returnSecondment(
  db: Database.Database,
  input: { vehicleId: string; actor: MutationActor; note?: string; now: string }
): ReturnSecondmentResult {
  const row = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(input.vehicleId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return { ok: false, status: 404, error: "Vehicle not found" };
  if (!isVehicleSeconded(row)) {
    return { ok: false, status: 400, error: `${String(row.code || "Vehicle")} is not currently seconded.` };
  }
  const before = secondmentSnapshot(row);
  writeSecondment(db, input.vehicleId, CLEARED, input.now);
  const note = String(input.note ?? "").trim();
  recordMutation(db, {
    entityType: "vehicle",
    entityId: input.vehicleId,
    organizationId: String(row.organization_id ?? ""),
    action: "secondment_return",
    actor: input.actor,
    before: { organization_id: row.organization_id, ...before },
    after: { organization_id: row.organization_id, ...CLEARED, returned_on: input.now.slice(0, 10) },
    reason: note,
  });

  let borrowerReservationsAfterReturn = 0;
  try {
    const r = db
      .prepare(
        `SELECT COUNT(*) AS n FROM vehicle_reservations
         WHERE vehicle_id = ? AND organization_id = ? AND status = 'active' AND COALESCE(end_date, start_date) >= ?`
      )
      .get(input.vehicleId, before.seconded_to_org, input.now.slice(0, 10)) as { n: number } | undefined;
    borrowerReservationsAfterReturn = r?.n ?? 0;
  } catch {
    // vehicle_reservations missing on a stripped-down DB: nothing to report.
  }
  return { ok: true, before, borrowerReservationsAfterReturn };
}
