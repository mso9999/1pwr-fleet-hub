import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";
import { vehicleVisibleToOrgSql } from "@/lib/vehicle-org-scope";

/**
 * GET /api/integrations/v1/vehicles
 * Export FM vehicle registry for PR reconciliation or scheduled pull sync.
 * Auth: `X-Fleet-Integration-Key` matching `FLEET_INTEGRATION_API_KEY` (≥12 chars).
 *
 * Query: `org` (default `1pwr_lesotho`), optional `includeInactive=true`,
 * optional `scope=owner` (owned vehicles only; default also returns vehicles seconded to `org`)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";
  const includeInactive = searchParams.get("includeInactive") === "true";

  const db = getDb();
  // Additive fields (transmission, drivetrain, assetClass) — AM caches vehicle
  // fields; the cross-repo contract allows additive changes only.
  // Secondment (additive): organizationId stays the OWNER; secondedToOrganizationId /
  // secondmentStart / secondmentExpectedReturn / operatingOrganizationId describe a loan.
  // Rows = vehicles in scope for `org` (owned or seconded in); `scope=owner` = owned only.
  const scope =
    searchParams.get("scope") === "owner"
      ? { sql: "organization_id = ?", params: [org] }
      : vehicleVisibleToOrgSql(org);
  let query = `
    SELECT id as fmVehicleId, organization_id as organizationId, code as fleetCode,
           make, model, year, license_plate as licensePlate, vin, engine_number as engineNumber,
           transmission, drivetrain, asset_class as assetClass,
           status, pr_firestore_id as prFirestoreId, updated_at as updatedAt,
           NULLIF(seconded_to_org, '') as secondedToOrganizationId,
           CASE WHEN COALESCE(seconded_to_org, '') != '' THEN secondment_start END as secondmentStart,
           CASE WHEN COALESCE(seconded_to_org, '') != '' THEN secondment_expected_return END as secondmentExpectedReturn,
           COALESCE(NULLIF(seconded_to_org, ''), organization_id) as operatingOrganizationId
    FROM vehicles WHERE ${scope.sql}
  `;
  if (!includeInactive) {
    query += " AND status != 'written-off'";
  }
  query += " ORDER BY code ASC";

  const rows = db.prepare(query).all(...scope.params);
  return NextResponse.json({ organizationId: org, count: rows.length, vehicles: rows });
}
