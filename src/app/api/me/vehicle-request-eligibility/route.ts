import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { isApprovedDriverForOrg } from "@/lib/approved-drivers";

/**
 * GET /api/me/vehicle-request-eligibility?org=…
 * Only EHS-approved drivers may POST vehicle requests (superadmin may bypass for testing).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = new URL(request.url).searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  const isApprovedDriver = isApprovedDriverForOrg(db, org, user.email);
  const canRequestVehicle = isApprovedDriver || user.role === "superadmin";
  return NextResponse.json({ isApprovedDriver, canRequestVehicle });
}
