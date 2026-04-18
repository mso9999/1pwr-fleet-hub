import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { EHS_DRIVER_MEDIA_ENTITY } from "@/lib/ehs-driver-media";
import { isEhsDriverFullyCompliant, type EhsDriverRow } from "@/lib/ehs-approved-drivers";

/**
 * GET /api/ehs-approved-drivers/options?org=
 * Returns the fully-compliant approved drivers for the org so any verified fleet user can
 * populate the driver combobox on the vehicle-check form. Only compliant rows are returned
 * (status=active, all four test dates on file, licence media attached, licence continuity ok).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM ehs_approved_drivers WHERE organization_id = ? ORDER BY display_name COLLATE NOCASE, email COLLATE NOCASE`
    )
    .all(org) as EhsDriverRow[];

  const mediaCount = db.prepare(
    `SELECT COUNT(*) AS c FROM media_attachments WHERE entity_type = ? AND entity_id = ?`
  );

  const options = rows
    .filter((row) => {
      const c = mediaCount.get(EHS_DRIVER_MEDIA_ENTITY, row.id) as { c: number };
      return isEhsDriverFullyCompliant(row, Number(c?.c ?? 0));
    })
    .map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name || row.email,
      hrEmployeeId: row.hr_employee_id || "",
    }));

  return NextResponse.json({ options });
}
