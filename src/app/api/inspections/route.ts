import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const vehicleId = searchParams.get("vehicleId");

  let query = `
    SELECT i.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM inspections i
    JOIN vehicles v ON i.vehicle_id = v.id
    WHERE i.organization_id = ?
  `;
  const org = searchParams.get("org") || "1pwr_lesotho";
  const params: string[] = [org];

  if (vehicleId) {
    query += " AND i.vehicle_id = ?";
    params.push(vehicleId);
  }

  query += " ORDER BY i.created_at DESC LIMIT 100";

  const inspections = db.prepare(query).all(...params);
  return NextResponse.json(
    (inspections as Array<Record<string, unknown>>).map((i) => ({
      ...i,
      items: typeof i.items === "string" ? JSON.parse(i.items as string) : i.items,
    }))
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const body = await request.json();
  const id = uuidv4();
  const now = new Date().toISOString();

  const items = body.items || [];
  const hasFailure = items.some((item: { rating: string }) => item.rating === "fail");
  const overallPass = !hasFailure;

  db.prepare(`
    INSERT INTO inspections (id, organization_id, vehicle_id, inspector_id, inspector_name, type, items, overall_pass, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.organizationId || "1pwr_lesotho",
    body.vehicleId,
    body.inspectorId || "",
    body.inspectorName || "",
    body.type || "pre-departure",
    JSON.stringify(items),
    overallPass ? 1 : 0,
    now
  );

  if (hasFailure) {
    const failItems = items.filter((item: { rating: string }) => item.rating === "fail");
    const failDesc = failItems.map((item: { category: string; item: string }) => `${item.category}: ${item.item}`).join(", ");
    const woId = uuidv4();
    db.prepare(`
      INSERT INTO work_orders (id, organization_id, vehicle_id, title, description, type, priority, status, downtime_start, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'inspection-flagged', 'high', 'reported', ?, ?, ?)
    `).run(woId, body.organizationId || "1pwr_lesotho", body.vehicleId, `Inspection failure: ${failDesc.substring(0, 80)}`, `Auto-created from inspection ${id}. Failed items: ${failDesc}`, now, now, now);
  }

  const inspection = db.prepare(`
    SELECT i.*, v.code as vehicle_code FROM inspections i JOIN vehicles v ON i.vehicle_id = v.id WHERE i.id = ?
  `).get(id) as Record<string, unknown>;

  return NextResponse.json({
    ...inspection,
    items: typeof inspection.items === "string" ? JSON.parse(inspection.items as string) : inspection.items,
  }, { status: 201 });
}
