import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, isFleetManagementRole } from "@/lib/server-auth";
import { normalizeEmail } from "@/lib/vehicle-check-approvers";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !isFleetManagementRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = new URL(request.url).searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, organization_id, hr_user_id, hr_employee_id, email, display_name, created_at
       FROM vehicle_check_override_approvers WHERE organization_id = ? ORDER BY display_name, email`
    )
    .all(org);
  return NextResponse.json({ approvers: rows });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !isFleetManagementRole(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as {
    organizationId?: string;
    approvers?: Array<{
      email: string;
      hrEmployeeId?: string;
      displayName?: string;
      hrUserId?: number | null;
    }>;
  };
  const organizationId = body.organizationId || "1pwr_lesotho";
  const approvers = body.approvers;
  if (!Array.isArray(approvers)) {
    return NextResponse.json({ error: "approvers array required" }, { status: 400 });
  }
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM vehicle_check_override_approvers WHERE organization_id = ?").run(organizationId);
    const ins = db.prepare(
      `INSERT INTO vehicle_check_override_approvers (id, organization_id, hr_user_id, hr_employee_id, email, display_name)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const a of approvers) {
      const email = normalizeEmail(a.email || "");
      if (!email) continue;
      ins.run(
        uuidv4(),
        organizationId,
        a.hrUserId ?? null,
        (a.hrEmployeeId || "").trim(),
        email,
        (a.displayName || "").trim() || email
      );
    }
  });
  tx();
  const rows = db
    .prepare(
      `SELECT id, organization_id, hr_user_id, hr_employee_id, email, display_name, created_at
       FROM vehicle_check_override_approvers WHERE organization_id = ? ORDER BY display_name, email`
    )
    .all(organizationId);
  return NextResponse.json({ approvers: rows });
}
