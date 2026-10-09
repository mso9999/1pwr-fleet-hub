import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import {
  canApproveMissionRequests,
  canAllocateFleetVehicleForOrg,
  canArbitrateMissionCapacity,
  canSkipLocalityInspectionForOrg,
} from "@/lib/vehicle-check-approvers";
import { isFleetManagementForOrg } from "@/lib/fleet-lead-scope";

/**
 * GET /api/me/mission-request-can-approve?org=…
 * PR credentialed approvers: mission + vehicle-request approve/reject (see system card).
 * Fleet lead for the org (superadmin, fleet-lead scope, own-org fleet_lead role, or HR
 * fm:vehicle_allocator for the country): vehicle allocation (canAllocateVehicle).
 * canSkipInspection: outside-50-km inspection override for this org (fleet lead or mission approver).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = new URL(request.url).searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  const canApprove = await canApproveMissionRequests(db, org, user.email, user.role);
  const canFullEdit = isFleetManagementForOrg(db, org, user.email, user.role);
  const canAllocateVehicle = await canAllocateFleetVehicleForOrg(db, org, user.email, user.role);
  const canSkipInspection = await canSkipLocalityInspectionForOrg(db, org, user.email, user.role);
  const canArbitrateCapacity = await canArbitrateMissionCapacity(db, org, user.email, user.role);
  return NextResponse.json({ canApprove, canFullEdit, canAllocateVehicle, canSkipInspection, canArbitrateCapacity });
}
