import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import {
  getVerifiedFleetUser,
  canViewFleetMechanicsRegister,
  canManageFleetMechanics,
} from "@/lib/server-auth";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";

export type FleetMechanicRow = {
  id: string;
  organization_id: string;
  hr_user_id: number | null;
  hr_employee_id: string;
  email: string;
  display_name: string;
  phone: string;
  mechanic_role: string;
  specialties: string;
  status: string;
  notes: string;
  created_at: string;
  created_by_id: string;
  created_by_name: string;
  updated_at: string;
  updated_by_id: string;
  updated_by_name: string;
};

function rowAfter(row: FleetMechanicRow): Record<string, unknown> {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = row;
  return rest;
}

/**
 * GET /api/fleet-mechanics?org=&status=
 * Any signed-in user can read. status filter optional ('active' by default when ?status=active).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !canViewFleetMechanicsRegister(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const org = sp.get("org") || "1pwr_lesotho";
  const status = sp.get("status");
  const db = getDb();

  const rows = status
    ? (db
        .prepare(
          `SELECT * FROM fleet_mechanics WHERE organization_id = ? AND status = ? ORDER BY display_name COLLATE NOCASE`
        )
        .all(org, status) as FleetMechanicRow[])
    : (db
        .prepare(
          `SELECT * FROM fleet_mechanics WHERE organization_id = ? ORDER BY status DESC, display_name COLLATE NOCASE`
        )
        .all(org) as FleetMechanicRow[]);

  return NextResponse.json({
    mechanics: rows,
    canManage: canManageFleetMechanics(user.role, user.department),
  });
}

/**
 * POST /api/fleet-mechanics
 * Add a new mechanic. Restricted to admin / fleet mgmt / DPO / HR / IT / Fleet dept.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !canManageFleetMechanics(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    organizationId?: string;
    displayName?: string;
    email?: string;
    phone?: string;
    hrUserId?: number | null;
    hrEmployeeId?: string;
    mechanicRole?: string;
    specialties?: string;
    status?: string;
    notes?: string;
    reason?: string;
  };
  const organizationId = body.organizationId || "1pwr_lesotho";
  const displayName = (body.displayName || "").trim();
  if (!displayName) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    db.prepare(
      `INSERT INTO fleet_mechanics (
        id, organization_id, hr_user_id, hr_employee_id, email, display_name, phone,
        mechanic_role, specialties, status, notes,
        created_at, created_by_id, created_by_name, updated_at, updated_by_id, updated_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      organizationId,
      body.hrUserId ?? null,
      (body.hrEmployeeId || "").trim(),
      (body.email || "").trim(),
      displayName,
      (body.phone || "").trim(),
      (body.mechanicRole || "mechanic").trim(),
      (body.specialties || "").trim(),
      (body.status || "active").trim(),
      (body.notes || "").trim(),
      now,
      user.id,
      user.name || user.email,
      now,
      user.id,
      user.name || user.email
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE/i.test(msg)) {
      return NextResponse.json(
        { error: "A mechanic with this display name already exists for this organisation." },
        { status: 409 }
      );
    }
    throw e;
  }

  const row = db.prepare(`SELECT * FROM fleet_mechanics WHERE id = ?`).get(id) as FleetMechanicRow;
  recordMutation(db, {
    entityType: "fleet_mechanic",
    entityId: id,
    organizationId,
    action: "create",
    actor: actorFrom(user),
    before: null,
    after: rowAfter(row),
    reason: body.reason || "",
  });

  return NextResponse.json(row, { status: 201 });
}
