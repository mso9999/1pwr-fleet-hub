import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare(`
    SELECT pdc.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM post_deployment_checks pdc
    JOIN vehicles v ON pdc.vehicle_id = v.id
    WHERE pdc.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...row,
    check_items: typeof row.check_items === "string" ? JSON.parse(row.check_items as string) : row.check_items,
    findings: typeof row.findings === "string" ? JSON.parse(row.findings as string) : row.findings,
    work_order_ids: typeof row.work_order_ids === "string" ? JSON.parse(row.work_order_ids as string) : row.work_order_ids,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";

  const result = db.prepare(
    "DELETE FROM post_deployment_checks WHERE id = ? AND organization_id = ?"
  ).run(id, org);

  if (result.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
