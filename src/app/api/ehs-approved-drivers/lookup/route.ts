import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, canViewEhsApprovedDriversRegister } from "@/lib/server-auth";
import { normalizeEmail } from "@/lib/vehicle-check-approvers";
import { EHS_DRIVER_MEDIA_ENTITY } from "@/lib/ehs-driver-media";
import { isEhsDriverFullyCompliant, type EhsDriverRow } from "@/lib/ehs-approved-drivers";

/**
 * GET /api/ehs-approved-drivers/lookup?org=&email=
 * Whether an email has an active, fully compliant EHS driver record (for trip/checkout checks).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !canViewEhsApprovedDriversRegister(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const org = sp.get("org") || "1pwr_lesotho";
  const email = normalizeEmail(sp.get("email") || "");
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM ehs_approved_drivers WHERE organization_id = ? AND lower(trim(email)) = ?`
    )
    .get(org, email) as EhsDriverRow | undefined;
  if (!row) {
    return NextResponse.json({
      found: false,
      fullyCompliant: false,
      email,
    });
  }
  const cnt = db
    .prepare(
      `SELECT COUNT(*) AS c FROM media_attachments WHERE entity_type = ? AND entity_id = ?`
    )
    .get(EHS_DRIVER_MEDIA_ENTITY, row.id) as { c: number };
  const licenseMediaCount = Number(cnt?.c ?? 0);
  const fullyCompliant = isEhsDriverFullyCompliant(row, licenseMediaCount);
  return NextResponse.json({
    found: true,
    fullyCompliant,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    id: row.id,
  });
}
