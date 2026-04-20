import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import {
  getVerifiedFleetUser,
  canViewEhsApprovedDriversRegister,
  canManageEhsApprovedDrivers,
} from "@/lib/server-auth";
import { normalizeEmail } from "@/lib/vehicle-check-approvers";
import { EHS_DRIVER_MEDIA_ENTITY } from "@/lib/ehs-driver-media";
import {
  isEhsDriverFullyCompliant,
  type EhsDriverRow,
} from "@/lib/ehs-approved-drivers";

function rowWithMeta(
  db: ReturnType<typeof getDb>,
  row: Record<string, unknown>
): Record<string, unknown> {
  const r = row as unknown as EhsDriverRow;
  const cnt = db
    .prepare(
      `SELECT COUNT(*) AS c FROM media_attachments WHERE entity_type = ? AND entity_id = ?`
    )
    .get(EHS_DRIVER_MEDIA_ENTITY, r.id) as { c: number };
  const licenseMediaCount = Number(cnt?.c ?? 0);
  const fullyCompliant = isEhsDriverFullyCompliant(r, licenseMediaCount);
  return { ...row, license_media_count: licenseMediaCount, fully_compliant: fullyCompliant };
}

/**
 * GET /api/ehs-approved-drivers?org=
 * List approved-driver records (EHS + fleet management).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !canViewEhsApprovedDriversRegister(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM ehs_approved_drivers WHERE organization_id = ? ORDER BY display_name COLLATE NOCASE, email COLLATE NOCASE`
    )
    .all(org) as Array<Record<string, unknown>>;
  const drivers = rows.map((row) => rowWithMeta(db, row));
  return NextResponse.json({ drivers });
}

/**
 * POST /api/ehs-approved-drivers
 * Add an employee from the HR directory to the register (EHS managers only).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !canManageEhsApprovedDrivers(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as {
    organizationId?: string;
    email?: string;
    displayName?: string;
    hrUserId?: number | null;
    hrEmployeeId?: string;
  };
  const organizationId = body.organizationId || "1pwr_lesotho";
  const email = normalizeEmail(body.email || "");
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  const displayName = (body.displayName || "").trim() || email;
  const now = new Date().toISOString();
  const id = uuidv4();
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO ehs_approved_drivers (
        id, organization_id, hr_user_id, hr_employee_id, email, display_name,
        license_valid_from, license_expiry,
        written_test_passed_at, road_test_passed_at, eye_test_passed_at, reaction_test_passed_at,
        status, notes, created_at, updated_at, updated_by_id, updated_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, '', '', '', '', '', '', 'active', '', ?, ?, ?, ?)`
    ).run(
      id,
      organizationId,
      body.hrUserId ?? null,
      (body.hrEmployeeId || "").trim(),
      email,
      displayName,
      now,
      now,
      user.id,
      user.name || user.email
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE constraint failed/i.test(msg)) {
      return NextResponse.json(
        { error: "This email is already on the approved-driver register for this organization." },
        { status: 409 }
      );
    }
    throw e;
  }
  const row = db.prepare("SELECT * FROM ehs_approved_drivers WHERE id = ?").get(id) as Record<string, unknown>;
  return NextResponse.json(rowWithMeta(db, row), { status: 201 });
}
