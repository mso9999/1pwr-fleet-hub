import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authorizeHrApiRequest } from "@/lib/hr-api-auth";
import { listDeploymentsForEmployee } from "@/lib/deployments";

/**
 * GET /api/deployments?employee_id=1PWR0159F&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns the employee's field-deployment history (newest first), optionally
 * constrained to a [from, to] date range (inclusive) on the inspection's
 * check_date.
 *
 * Auth: X-API-Key: <FLEET_HR_API_KEY> (optionally IP-allow-listed).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeHrApiRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sp = request.nextUrl.searchParams;
  const employeeId = sp.get("employee_id")?.trim() || "";
  if (!employeeId) {
    return NextResponse.json(
      { error: "employee_id query parameter is required." },
      { status: 400 }
    );
  }
  const from = sp.get("from")?.trim() || undefined;
  const to = sp.get("to")?.trim() || undefined;
  const limitParam = parseInt(sp.get("limit") || "100", 10);
  const limit = Number.isFinite(limitParam) ? limitParam : 100;

  // Light validation on date shape (YYYY-MM-DD).
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (from && !dateRe.test(from)) {
    return NextResponse.json({ error: "from must be YYYY-MM-DD" }, { status: 400 });
  }
  if (to && !dateRe.test(to)) {
    return NextResponse.json({ error: "to must be YYYY-MM-DD" }, { status: 400 });
  }

  const db = getDb();
  const deployments = listDeploymentsForEmployee(db, { employeeId, from, to, limit });
  return NextResponse.json({
    employee_id: employeeId,
    count: deployments.length,
    from: from ?? null,
    to: to ?? null,
    deployments,
  });
}
