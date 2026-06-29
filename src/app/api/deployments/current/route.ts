import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authorizeHrApiRequest } from "@/lib/hr-api-auth";
import { currentDeploymentForEmployee } from "@/lib/deployments";

/**
 * GET /api/deployments/current?employee_id=1PWR0159F
 *
 * Returns the employee's currently-active field deployment — the most recent
 * departing driver vehicle check that lists them on the passenger manifest and
 * whose linked trip has departed but not yet been checked in.
 *
 * Auth: X-API-Key: <FLEET_HR_API_KEY> (optionally IP-allow-listed).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeHrApiRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const employeeId = request.nextUrl.searchParams.get("employee_id")?.trim() || "";
  if (!employeeId) {
    return NextResponse.json(
      { error: "employee_id query parameter is required." },
      { status: 400 }
    );
  }

  const db = getDb();
  const deployment = currentDeploymentForEmployee(db, employeeId);
  if (!deployment) {
    return NextResponse.json(
      {
        error: "No active field deployment found for this employee.",
        employee_id: employeeId,
      },
      { status: 404 }
    );
  }
  return NextResponse.json(deployment);
}
