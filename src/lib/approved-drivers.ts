import type { Database } from "better-sqlite3";
import { normalizeEmail } from "@/lib/vehicle-check-approvers";

/**
 * EHS “approved drivers” register — required to submit vehicle requests (not missions or trip checkouts).
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
