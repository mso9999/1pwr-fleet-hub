import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, isFleetManagementRole } from "@/lib/server-auth";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const orgId = req.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const type = req.nextUrl.searchParams.get("type");

  let query = "SELECT * FROM reference_data WHERE organization_id = ?";
  const params: string[] = [orgId];

  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  query += " ORDER BY type, sort_order, label";
  const rows = db.prepare(query).all(...params);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(req);
  if (!user || (!isFleetManagementRole(user.role) && user.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: user ? 403 : 401 });
  }

  const db = getDb();
  const body = await req.json();
  const { organization_id, type, code, label, sort_order, meta } = body;

  if (!type || !code || !label) {
    return NextResponse.json({ error: "type, code, and label are required" }, { status: 400 });
  }

  const orgId = organization_id || "1pwr_lesotho";
  const stmt = db.prepare(`
    INSERT INTO reference_data (id, organization_id, type, code, label, sort_order, meta)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(orgId, type, code, label, sort_order || 0, meta || "{}");
    const row = db
      .prepare("SELECT * FROM reference_data WHERE organization_id = ? AND type = ? AND code = ?")
      .get(orgId, type, code) as Record<string, unknown> | undefined;
    if (row) {
      recordMutation(db, {
        entityType: "reference_data",
        entityId: String(row.id),
        organizationId: orgId,
        action: "create",
        actor: auditActorFrom(user, {}),
        after: { type, code, label, sort_order: sort_order || 0 },
      });
    }
    return NextResponse.json({ success: true, id: row?.id }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Insert failed";
    if (msg.includes("UNIQUE")) {
      return NextResponse.json({ error: "Item with this code already exists for this org/type" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
