import { NextResponse } from "next/server";
import { fetchHrEmployeeDirectory } from "@/lib/hr-directory-client";
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
 * GET /api/hr-directory/manifest-options?country=&department=
 *
 * Minimal HR-directory projection for the passenger-manifest picker on the
 * driver vehicle checklist. The manifest is REQUIRED on departing checks and
 * every driver must be able to fill it, so unlike /api/admin/hr-directory
 * (full records, PII-adjacent, restricted to fleet management/EHS/DPO/HR/IT)
 * this endpoint is open to any verified fleet user and returns only the
 * fields the picker renders: employee_id, name, email, department, country,
 * current_position_title.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { user, reason } = await verifyFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: explain(reason), reason }, { status: 401 });
  }
  const sp = new URL(request.url).searchParams;
  const country = sp.get("country") || undefined;
  const department = sp.get("department") || undefined;
  const result = await fetchHrEmployeeDirectory({ country, department });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  const employees = (result.employees ?? []).map((e) => ({
    employee_id: e.employee_id ?? null,
    name: e.name,
    email: e.email,
    department: e.department ?? null,
    country: e.country ?? null,
    current_position_title: e.current_position_title ?? null,
  }));
  return NextResponse.json({ ok: true, employees });
}
