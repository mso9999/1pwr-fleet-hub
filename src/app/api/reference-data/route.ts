import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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
  const db = getDb();
  const body = await req.json();
  const { organization_id, type, code, label, sort_order, meta } = body;

  if (!type || !code || !label) {
    return NextResponse.json({ error: "type, code, and label are required" }, { status: 400 });
  }

  const stmt = db.prepare(`
    INSERT INTO reference_data (id, organization_id, type, code, label, sort_order, meta)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(organization_id || "1pwr_lesotho", type, code, label, sort_order || 0, meta || "{}");
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Insert failed";
    if (msg.includes("UNIQUE")) {
      return NextResponse.json({ error: "Item with this code already exists for this org/type" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
