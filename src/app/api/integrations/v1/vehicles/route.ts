import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";

/**
 * GET /api/integrations/v1/vehicles
 * Export FM vehicle registry for PR reconciliation or scheduled pull sync.
 * Auth: `X-Fleet-Integration-Key` matching `FLEET_INTEGRATION_API_KEY` (≥12 chars).
 *
 * Query: `org` (default `1pwr_lesotho`), optional `includeInactive=true`
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";
  const includeInactive = searchParams.get("includeInactive") === "true";

  const db = getDb();
  let query = `
    SELECT id as fmVehicleId, organization_id as organizationId, code as fleetCode,
           make, model, year, license_plate as licensePlate, vin, engine_number as engineNumber,
           status, pr_firestore_id as prFirestoreId, updated_at as updatedAt
    FROM vehicles WHERE organization_id = ?
  `;
  if (!includeInactive) {
    query += " AND status != 'written-off'";
  }
  query += " ORDER BY code ASC";

  const rows = db.prepare(query).all(org);
  return NextResponse.json({ organizationId: org, count: rows.length, vehicles: rows });
}
