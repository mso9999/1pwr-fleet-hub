import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canApproveVehicleCheckExceptions } from "@/lib/vehicle-check-approvers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const body = await request.json();
  const now = new Date().toISOString();

  const existing = db.prepare(
    "SELECT * FROM driver_vehicle_checks WHERE id = ?"
  ).get(id) as Record<string, unknown> | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const orgId = String(existing.organization_id ?? "1pwr_lesotho");
  if (
    !canApproveVehicleCheckExceptions(db, orgId, user.email, user.role)
  ) {
    return NextResponse.json(
      { error: "Not authorized to approve vehicle check exceptions" },
      { status: 403 }
    );
  }

  if (!existing.has_exceptions) {
    return NextResponse.json(
      { error: "This check has no exceptions to approve" },
      { status: 400 }
    );
  }

  db.prepare(`
    UPDATE driver_vehicle_checks
    SET exception_approved = 1,
        approved_by = ?,
        approved_at = ?,
        approval_method = ?,
        overall_pass = 1,
        updated_at = ?
    WHERE id = ?
  `).run(
    body.approvedBy || "",
    now,
    body.approvalMethod || "in-app",
    now,
    id
  );

  db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("driver_vehicle_check", id, "exceptions_pending", "exceptions_approved", body.approvedBy || "", now);

  const updated = db.prepare(`
    SELECT dvc.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM driver_vehicle_checks dvc
    JOIN vehicles v ON dvc.vehicle_id = v.id
    WHERE dvc.id = ?
  `).get(id);

  return NextResponse.json(updated);
}
