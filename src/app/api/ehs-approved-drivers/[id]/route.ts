import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, canManageEhsApprovedDrivers, canViewEhsApprovedDrivers } from "@/lib/server-auth";
import { EHS_DRIVER_MEDIA_ENTITY } from "@/lib/ehs-driver-media";
import { isEhsDriverFullyCompliant, type EhsDriverRow } from "@/lib/ehs-approved-drivers";

function rowWithMeta(db: ReturnType<typeof getDb>, row: Record<string, unknown>): Record<string, unknown> {
  const r = row as unknown as EhsDriverRow;
  const cnt = db
    .prepare(
      `SELECT COUNT(*) AS c FROM media_attachments WHERE entity_type = ? AND entity_id = ?`
    )
    .get(EHS_DRIVER_MEDIA_ENTITY, r.id) as { c: number };
  const licenseMediaCount = Number(cnt?.c ?? 0);
  return {
    ...row,
    license_media_count: licenseMediaCount,
    fully_compliant: isEhsDriverFullyCompliant(r, licenseMediaCount),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canViewEhsApprovedDrivers(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const row = db.prepare("SELECT * FROM ehs_approved_drivers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rowWithMeta(db, row));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canManageEhsApprovedDrivers(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const existing = db.prepare("SELECT * FROM ehs_approved_drivers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as Record<string, unknown>;
  const now = new Date().toISOString();

  const map: Record<string, string> = {
    displayName: "display_name",
    hrUserId: "hr_user_id",
    hrEmployeeId: "hr_employee_id",
    licenseValidFrom: "license_valid_from",
    licenseExpiry: "license_expiry",
    writtenTestPassedAt: "written_test_passed_at",
    roadTestPassedAt: "road_test_passed_at",
    eyeTestPassedAt: "eye_test_passed_at",
    reactionTestPassedAt: "reaction_test_passed_at",
    status: "status",
    notes: "notes",
  };

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [jsKey, col] of Object.entries(map)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${col} = ?`);
      if (jsKey === "hrUserId") {
        values.push(body[jsKey] === null ? null : Number(body[jsKey]));
      } else {
        values.push(body[jsKey]);
      }
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  fields.push("updated_at = ?", "updated_by_id = ?", "updated_by_name = ?");
  values.push(now, user.id, user.name || user.email);
  values.push(id);

  db.prepare(`UPDATE ehs_approved_drivers SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  const row = db.prepare("SELECT * FROM ehs_approved_drivers WHERE id = ?").get(id) as Record<string, unknown>;
  return NextResponse.json(rowWithMeta(db, row));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canManageEhsApprovedDrivers(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const r = db.prepare("DELETE FROM ehs_approved_drivers WHERE id = ?").run(id);
  if (r.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
