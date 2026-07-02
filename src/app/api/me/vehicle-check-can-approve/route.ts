import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canApproveVehicleCheckExceptions } from "@/lib/vehicle-check-approvers";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = new URL(request.url).searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  const canApprove = await canApproveVehicleCheckExceptions(db, org, user.email, user.role);
  return NextResponse.json({ canApprove });
}
