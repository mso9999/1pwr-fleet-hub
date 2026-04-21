import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  getVerifiedFleetUser,
  canViewFleetMechanicsRegister,
  canManageFleetMechanics,
} from "@/lib/server-auth";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import type { FleetMechanicRow } from "../route";

function rowAfter(row: FleetMechanicRow): Record<string, unknown> {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = row;
  return rest;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canViewFleetMechanicsRegister(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const row = db.prepare(`SELECT * FROM fleet_mechanics WHERE id = ?`).get(id) as FleetMechanicRow | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canManageFleetMechanics(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM fleet_mechanics WHERE id = ?`).get(id) as
    | FleetMechanicRow
    | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as Record<string, unknown>;

  const map: Record<string, string> = {
    displayName: "display_name",
    email: "email",
    phone: "phone",
    hrUserId: "hr_user_id",
    hrEmployeeId: "hr_employee_id",
    mechanicRole: "mechanic_role",
    specialties: "specialties",
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

  const now = new Date().toISOString();
  fields.push("updated_at = ?", "updated_by_id = ?", "updated_by_name = ?");
  values.push(now, user.id, user.name || user.email);
  values.push(id);

  try {
    db.prepare(`UPDATE fleet_mechanics SET ${fields.join(", ")} WHERE id = ?`).run(...values);
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
    organizationId: existing.organization_id,
    action: "update",
    actor: actorFrom(user),
    before: rowAfter(existing),
    after: rowAfter(row),
    reason: typeof body.reason === "string" ? body.reason : "",
  });

  return NextResponse.json(row);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canManageFleetMechanics(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM fleet_mechanics WHERE id = ?`).get(id) as
    | FleetMechanicRow
    | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  db.prepare(`DELETE FROM fleet_mechanics WHERE id = ?`).run(id);

  recordMutation(db, {
    entityType: "fleet_mechanic",
    entityId: id,
    organizationId: existing.organization_id,
    action: "delete",
    actor: actorFrom(user),
    before: rowAfter(existing),
    after: null,
    reason:
      typeof (request as unknown as { bodyReason?: string }).bodyReason === "string"
        ? ((request as unknown as { bodyReason: string }).bodyReason)
        : "",
  });

  return NextResponse.json({ success: true });
}
