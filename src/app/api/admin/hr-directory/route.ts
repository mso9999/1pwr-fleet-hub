import { NextResponse } from "next/server";
import { fetchHrEmployeeDirectory } from "@/lib/hr-directory-client";
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

export async function GET(request: Request): Promise<NextResponse> {
  const { user, reason } = await verifyFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: explain(reason), reason }, { status: 401 });
  }
  // Gate HR directory access (contains PII) to: fleet management, EHS, or anyone who
  // already has Fleet Mechanics edit rights (DPO / HR / IT / Fleet department).
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
  const country = new URL(request.url).searchParams.get("country") || undefined;
  const result = await fetchHrEmployeeDirectory({ country });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
