import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const links = db.prepare(
    "SELECT * FROM work_order_po_links WHERE work_order_id = ? ORDER BY created_at DESC"
  ).all(id);
  return NextResponse.json(links);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();

  const wo = db.prepare("SELECT id FROM work_orders WHERE id = ?").get(id);
  if (!wo) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

  const linkId = uuidv4();
  db.prepare(`
    INSERT INTO work_order_po_links (id, work_order_id, pr_number, po_number, vendor, description, amount, currency, status, pr_system_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    linkId,
    id,
    body.prNumber || "",
    body.poNumber || "",
    body.vendor || "",
    body.description || "",
    body.amount || 0,
    body.currency || "LSL",
    body.status || "pending",
    body.prSystemUrl || `https://pr.1pwrafrica.com`
  );

  // Recalculate third_party_cost on work order
  const poSum = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) as total FROM work_order_po_links WHERE work_order_id = ?"
  ).get(id) as { total: number };

  db.prepare(
    "UPDATE work_orders SET third_party_cost = ?, total_cost = parts_cost + labour_cost + ?, updated_at = ? WHERE id = ?"
  ).run(poSum.total, poSum.total, new Date().toISOString(), id);

  const entry = db.prepare("SELECT * FROM work_order_po_links WHERE id = ?").get(linkId);
  return NextResponse.json(entry, { status: 201 });
}
