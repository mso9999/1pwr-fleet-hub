import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, isFleetManagementRole } from "@/lib/server-auth";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";

function refAudit(r: Record<string, unknown>): Record<string, unknown> {
  return {
    type: r.type,
    code: r.code,
    label: r.label,
    sort_order: r.sort_order,
    active: r.active,
  };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(req);
  if (!user || (!isFleetManagementRole(user.role) && user.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: user ? 403 : 401 });
  }

  const db = getDb();
  const { id } = await params;
  const body = await req.json();

  const existing = db.prepare("SELECT * FROM reference_data WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const beforeSnap = refAudit(existing);

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(body)) {
    if (["label", "code", "sort_order", "active", "meta"].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  const result = db.prepare(`UPDATE reference_data SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = db.prepare("SELECT * FROM reference_data WHERE id = ?").get(id) as Record<string, unknown>;
  recordMutation(db, {
    entityType: "reference_data",
    entityId: id,
    organizationId: String(existing.organization_id ?? ""),
    action: "update",
    actor: auditActorFrom(user, {}),
    before: beforeSnap,
    after: refAudit(updated),
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(req);
  if (!user || (!isFleetManagementRole(user.role) && user.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: user ? 403 : 401 });
  }

  const db = getDb();
  const { id } = await params;
  const existing = db.prepare("SELECT * FROM reference_data WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  recordMutation(db, {
    entityType: "reference_data",
    entityId: id,
    organizationId: String(existing.organization_id ?? ""),
    action: "delete",
    actor: auditActorFrom(user, {}),
    before: refAudit(existing),
  });

  const result = db.prepare("DELETE FROM reference_data WHERE id = ?").run(id);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
