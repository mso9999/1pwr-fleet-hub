import type { Database } from "better-sqlite3";
import { normalizeEmail } from "@/lib/vehicle-check-approvers";
import {
  EHS_DRIVER_MEDIA_ENTITY,
  EHS_OPERATOR_AUTH_MEDIA_ENTITY,
} from "@/lib/ehs-driver-media";
import {
  evaluateOperatorCompliance,
  type EhsDriverRow,
  type EhsOperatorAuthorization,
} from "@/lib/ehs-approved-drivers";
import {
  DEFAULT_OPERATOR_CATEGORY,
  isKnownOperatorCategory,
  type OperatorCategoryCode,
} from "@/lib/ehs-operator-categories";

function operatorIsReadyForCategory(
  db: Database,
  row: EhsDriverRow,
  category: OperatorCategoryCode,
  referenceNow: Date
): boolean {
  const authorizations = db
    .prepare(
      `SELECT * FROM ehs_operator_authorizations WHERE operator_id = ?`
    )
    .all(row.id) as EhsOperatorAuthorization[];

  const licenceCnt = db
    .prepare(
      `SELECT COUNT(*) AS c FROM media_attachments WHERE entity_type = ? AND entity_id = ?`
    )
    .get(EHS_DRIVER_MEDIA_ENTITY, row.id) as { c: number };
  const licenceMediaCount = Number(licenceCnt?.c ?? 0);

  const trainingMediaCountByAuthId: Record<string, number> = {};
  if (authorizations.length > 0) {
    const ids = authorizations.map((a) => a.id);
    const placeholders = ids.map(() => "?").join(", ");
    const mediaRows = db
      .prepare(
        `SELECT entity_id as id, COUNT(*) as c
         FROM media_attachments
         WHERE entity_type = ? AND entity_id IN (${placeholders})
         GROUP BY entity_id`
      )
      .all(EHS_OPERATOR_AUTH_MEDIA_ENTITY, ...ids) as Array<{ id: string; c: number }>;
    for (const r of mediaRows) trainingMediaCountByAuthId[r.id] = Number(r.c);
  }

  return evaluateOperatorCompliance({
    row,
    authorizations,
    licenceMediaCount,
    trainingMediaCountByAuthId,
    category,
    referenceNow,
  }).ready;
}

/**
 * True when the given EHS operator row id exists in the organisation and is fully
 * compliant for the category (same rules as {@link isApprovedDriverForCategory}).
 */
export function isApprovedOperatorIdForCategory(
  db: Database,
  organizationId: string,
  operatorId: string,
  category: string = DEFAULT_OPERATOR_CATEGORY,
  referenceNow: Date = new Date()
): boolean {
  const row = db
    .prepare(
      `SELECT * FROM ehs_approved_drivers WHERE organization_id = ? AND id = ?`
    )
    .get(organizationId, operatorId) as EhsDriverRow | undefined;
  if (!row) return false;
  const categoryCode: OperatorCategoryCode = isKnownOperatorCategory(category)
    ? category
    : DEFAULT_OPERATOR_CATEGORY;
  return operatorIsReadyForCategory(db, row, categoryCode, referenceNow);
}

/**
 * Legacy helper: cheap "is the user in the register at all?" check. Kept only for
 * places where we merely want to block unknown users. Prefer
 * {@link isApprovedDriverForCategory} below for any real fleet gate.
 */
export function isApprovedDriverForOrg(
  db: Database,
  organizationId: string,
  userEmail: string
): boolean {
  const n = normalizeEmail(userEmail);
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM ehs_approved_drivers
       WHERE organization_id = ? AND lower(trim(email)) = ?`
    )
    .get(organizationId, n) as { ok: number } | undefined;
  return !!row;
}

/**
 * D018-aware gate: the user must have a fully compliant approval for the given category
 * (default: fleet_vehicle_onroad) in the given organisation. Use this for vehicle-request
 * submission and any other path that needs "may this person actually drive / operate?"
 */
export function isApprovedDriverForCategory(
  db: Database,
  organizationId: string,
  userEmail: string,
  category: string = DEFAULT_OPERATOR_CATEGORY,
  referenceNow: Date = new Date()
): boolean {
  const n = normalizeEmail(userEmail);
  const row = db
    .prepare(
      `SELECT * FROM ehs_approved_drivers
       WHERE organization_id = ? AND lower(trim(email)) = ?`
    )
    .get(organizationId, n) as EhsDriverRow | undefined;
  if (!row) return false;

  const categoryCode: OperatorCategoryCode = isKnownOperatorCategory(category)
    ? category
    : DEFAULT_OPERATOR_CATEGORY;

  return operatorIsReadyForCategory(db, row, categoryCode, referenceNow);
}
