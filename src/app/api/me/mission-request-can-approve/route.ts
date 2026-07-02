import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import {
  canApproveMissionRequests,
  canAllocateFleetVehicle,
  canArbitrateMissionCapacity,
  canFullyManageVehicleRequests,
} from "@/lib/vehicle-check-approvers";

/**
 * GET /api/me/mission-request-can-approve?org=…
 * PR credentialed approvers: mission + vehicle-request approve/reject (see system card).
 * Fleet team lead: vehicle allocation only (canAllocateVehicle).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = new URL(request.url).searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  const canApprove = await canApproveMissionRequests(db, org, user.email, user.role);
  const canFullEdit = canFullyManageVehicleRequests(user.role);
  const canAllocateVehicle = canAllocateFleetVehicle(user.role);
  const canArbitrateCapacity = await canArbitrateMissionCapacity(db, org, user.email, user.role);
  return NextResponse.json({ canApprove, canFullEdit, canAllocateVehicle, canArbitrateCapacity });
}
