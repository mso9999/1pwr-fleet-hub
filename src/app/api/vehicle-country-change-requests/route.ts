import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await getVerifiedFleetUser(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "";
  const status = searchParams.get("status") || "";

  let query = `
    SELECT r.*,
           v.code AS vehicle_code,
           fo.name AS from_org_name,
           to_org.name AS to_org_name
    FROM vehicle_country_change_requests r
    JOIN vehicles v ON r.vehicle_id = v.id
    LEFT JOIN organizations fo ON r.from_organization_id = fo.id
    LEFT JOIN organizations to_org ON r.to_organization_id = to_org.id
    WHERE 1=1
  `;
  const params: string[] = [];

  if (org) {
    query += " AND (r.from_organization_id = ? OR r.to_organization_id = ?)";
    params.push(org, org);
  }
  if (status) {
    query += " AND r.status = ?";
    params.push(status);
  }

  query += " ORDER BY r.created_at DESC LIMIT 200";

  const rows = db.prepare(query).all(...params);
  return NextResponse.json(rows);
}
