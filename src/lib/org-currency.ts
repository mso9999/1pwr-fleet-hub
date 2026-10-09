import type Database from "better-sqlite3";

/** Fallback when an org row has no currency (FM's original single-country default). */
export const FALLBACK_CURRENCY = "LSL";

/**
 * Default currency for money fields on records created in an organization
 * (e.g. a new vehicle's purchase_currency). Reads `organizations.currency`
 * (1pwr_lesotho → LSL, 1pwr_zambia → ZMW, 1pwr_benin → XOF), falling back to LSL.
 */
export function defaultCurrencyForOrg(db: Database.Database, organizationId: string): string {
  try {
    const row = db
      .prepare("SELECT currency FROM organizations WHERE id = ?")
      .get(String(organizationId || "").trim().toLowerCase()) as { currency?: string | null } | undefined;
    const c = String(row?.currency ?? "").trim().toUpperCase();
    return c || FALLBACK_CURRENCY;
  } catch {
    return FALLBACK_CURRENCY;
  }
}
