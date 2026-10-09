import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import {
  canAllocateFleetVehicleForOrg,
  canApproveMissionRequests,
  canReserveMissionVehicleForOrg,
  canOverrideDriverApproval,
  canOverrideInspectionGate,
  canArbitrateMissionCapacity,
} from "@/lib/vehicle-check-approvers";
import { isFleetManagementForOrg } from "@/lib/fleet-lead-scope";

/**
 * GET /api/me/mission-request-can-approve?org=…
 * PR credentialed approvers: mission + vehicle-request approve/reject (see system card).
 * Fleet lead for the org (fleet-lead scope, own-org fleet_lead role, HR fm:vehicle_allocator
 * for the country, superadmin) or a manager of the org: vehicle allocation (canAllocateVehicle).
 * canSkipInspection: outside-50-km inspection override for this org (same cohort).
 * isFleetLead: fleet lead for the org without the manager clause (checkout hold).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = new URL(request.url).searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  const canApprove = await canApproveMissionRequests(db, org, user.email, user.role);
  const canFullEdit = isFleetManagementForOrg(db, org, user);
  const canAllocateVehicle = await canReserveMissionVehicleForOrg(db, org, user);
  const canSkipInspection = await canOverrideInspectionGate(db, org, user);
  const isFleetLead = await canAllocateFleetVehicleForOrg(db, org, user.email, user.role);
  const canArbitrateCapacity = await canArbitrateMissionCapacity(db, org, user.email, user.role);
  const canOverrideDriver = canApprove || (await canOverrideDriverApproval(db, org, user));
  return NextResponse.json({
    canApprove,
    canFullEdit,
    canAllocateVehicle,
    canSkipInspection,
    isFleetLead,
    canArbitrateCapacity,
    canOverrideDriver,
  });
}
