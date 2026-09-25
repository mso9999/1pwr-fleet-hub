import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { getOrgFuelDefaults } from "@/lib/fuel-estimate";

/** GET /api/fuel-calculator/defaults?org= */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  return NextResponse.json(getOrgFuelDefaults(db, org));
}
