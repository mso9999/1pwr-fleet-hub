import { NextResponse } from "next/server";
import { fetchHrEmployeeMeta } from "@/lib/hr-directory-client";
import { verifyFleetUser, type AuthFailure } from "@/lib/server-auth";

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
 * GET /api/hr-directory/manifest-options/meta
 * Country + department filter values for the passenger-manifest picker.
 * Open to any verified fleet user (names of countries/departments only —
 * no employee data); see ../route.ts for the rationale.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { user, reason } = await verifyFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: explain(reason), reason }, { status: 401 });
  }
  const result = await fetchHrEmployeeMeta();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
