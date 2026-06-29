import { NextResponse } from "next/server";
import { fetchHrEmployeeMeta } from "@/lib/hr-directory-client";
import {
  verifyFleetUser,
  isFleetManagementRole,
  canViewEhsApprovedDrivers,
  canManageFleetMechanics,
  type AuthFailure,
} from "@/lib/server-auth";

function explain(reason: AuthFailure | undefined): string {
  switch (reason) {
    case "no_bearer":
      return "Sign in to continue.";
    case "bad_token":
      return "Your session has expired — sign out and sign in again.";
    case "deactivated":
      return "Your Fleet Hub account is deactivated. Contact an admin to re-enable it.";
    case "auth_unconfigured":
      return "Fleet Hub authentication is not configured on this server. Contact IT.";
    default:
      return "Unauthorized";
  }
}

/**
 * GET /api/admin/hr-directory/meta
 * Returns the list of countries and departments the HR directory can be filtered
 * by, so the passenger manifest picker can populate its filter dropdowns
 * dynamically instead of hardcoding them. Same access gate as the directory
 * itself (PII-adjacent).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { user, reason } = await verifyFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: explain(reason), reason }, { status: 401 });
  }
  const allowed =
    isFleetManagementRole(user.role) ||
    canViewEhsApprovedDrivers(user.role, user.department) ||
    canManageFleetMechanics(user.role, user.department);
  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "You don't have access to the HR directory. It is restricted to fleet management, EHS, DPO, HR, IT, and Fleet-department users.",
      },
      { status: 403 }
    );
  }
  const result = await fetchHrEmployeeMeta();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
