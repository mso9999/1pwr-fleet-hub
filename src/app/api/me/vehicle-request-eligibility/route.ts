import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { isApprovedDriverForCategory } from "@/lib/approved-drivers";
import {
  DEFAULT_OPERATOR_CATEGORY,
  isKnownOperatorCategory,
} from "@/lib/ehs-operator-categories";

/**
 * GET /api/me/vehicle-request-eligibility?org=…&category=fleet_vehicle_onroad
 * Only fully compliant (D018) operators may POST vehicle requests for that category;
 * superadmin may bypass for testing.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const org = url.searchParams.get("org") || "1pwr_lesotho";
  const cat = (url.searchParams.get("category") || "").trim();
  const category = isKnownOperatorCategory(cat) ? cat : DEFAULT_OPERATOR_CATEGORY;
  const db = getDb();
  const isApprovedDriver = isApprovedDriverForCategory(db, org, user.email, category);
  const canRequestVehicle = isApprovedDriver || user.role === "superadmin";
  return NextResponse.json({ isApprovedDriver, canRequestVehicle, category });
}
