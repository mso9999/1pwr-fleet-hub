import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { isFleetManagementForOrg } from "@/lib/fleet-lead-scope";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";
import { normalizeEmail } from "@/lib/vehicle-check-approvers";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  const org = new URL(request.url).searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  if (!user || !isFleetManagementForOrg(db, org, user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
  if (!user) {
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
  if (!isFleetManagementForOrg(db, organizationId, user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prevCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM vehicle_check_override_approvers WHERE organization_id = ?`
      )
      .get(organizationId) as { c: number }
  ).c;

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

  recordMutation(db, {
    entityType: "organization",
    entityId: organizationId,
    organizationId,
    action: "admin_config",
    actor: auditActorFrom(user, {}),
    before: { vehicleCheckApproverCount: prevCount },
    after: { vehicleCheckApproverCount: approvers.filter((a) => normalizeEmail(a.email || "")).length },
    reason: "vehicle_check_override_approvers",
  });

  const rows = db
    .prepare(
      `SELECT id, organization_id, hr_user_id, hr_employee_id, email, display_name, created_at
       FROM vehicle_check_override_approvers WHERE organization_id = ? ORDER BY display_name, email`
    )
    .all(organizationId);
  return NextResponse.json({ approvers: rows });
}
