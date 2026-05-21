import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";
import { v4 as uuidv4 } from "uuid";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const sp = request.nextUrl.searchParams;
  const org = sp.get("org") || "1pwr_lesotho";

  let query = `
    SELECT pdc.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM post_deployment_checks pdc
    JOIN vehicles v ON pdc.vehicle_id = v.id
    WHERE pdc.organization_id = ?
  `;
  const params: unknown[] = [org];

  const vehicleId = sp.get("vehicleId");
  if (vehicleId) { query += " AND pdc.vehicle_id = ?"; params.push(vehicleId); }

  const tripId = sp.get("tripId");
  if (tripId) { query += " AND pdc.trip_id = ?"; params.push(tripId); }

  query += " ORDER BY pdc.created_at DESC LIMIT 100";

  const rows = db.prepare(query).all(...params);
  return NextResponse.json(
    (rows as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      check_items: typeof r.check_items === "string" ? JSON.parse(r.check_items as string) : r.check_items,
      findings: typeof r.findings === "string" ? JSON.parse(r.findings as string) : r.findings,
      work_order_ids: typeof r.work_order_ids === "string" ? JSON.parse(r.work_order_ids as string) : r.work_order_ids,
    }))
  );
}

const MECHANICAL_CHECK_ITEMS = [
  { category: "Engine", item: "Oil leaks" },
  { category: "Engine", item: "Coolant level" },
  { category: "Engine", item: "Unusual noises" },
  { category: "Engine", item: "Warning lights" },
  { category: "Drivetrain", item: "Clutch operation" },
  { category: "Drivetrain", item: "Gearbox shifting" },
  { category: "Drivetrain", item: "4WD engagement" },
  { category: "Brakes", item: "Brake performance" },
  { category: "Brakes", item: "Handbrake" },
  { category: "Brakes", item: "Brake fluid" },
  { category: "Suspension", item: "Shock absorbers" },
  { category: "Suspension", item: "Ball joints / bushes" },
  { category: "Suspension", item: "Steering play" },
  { category: "Fluids", item: "Engine oil level" },
  { category: "Fluids", item: "Transmission fluid" },
  { category: "Fluids", item: "Power steering fluid" },
  { category: "Tires", item: "Tire pressure" },
  { category: "Tires", item: "Tread depth" },
  { category: "Tires", item: "Spare wheel" },
  { category: "Body", item: "New damage or dents" },
  { category: "Body", item: "Lights functional" },
  { category: "Body", item: "Windshield" },
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  const db = getDb();
  const body = await request.json();
  const id = uuidv4();
  const now = new Date().toISOString();
  const orgId = body.organizationId || "1pwr_lesotho";

  const checkItems = body.checkItems || [];
  const failItems = checkItems.filter((i: { rating: string }) => i.rating === "fail");
  const overallStatus = failItems.length > 0 ? "fail" : "pass";

  const createdWoIds: string[] = [];

  if (failItems.length >= 2) {
    const woId = uuidv4();
    const failDesc = failItems
      .map((i: { category: string; item: string }) => `${i.category}: ${i.item}`)
      .join(", ");
    db.prepare(`
      INSERT INTO work_orders (id, organization_id, vehicle_id, title, description, type, priority, status, downtime_start, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'inspection-flagged', 'high', 'reported', ?, ?, ?)
    `).run(
      woId,
      orgId,
      body.vehicleId,
      `Post-deployment failures (${failItems.length}): ${failDesc.substring(0, 80)}`,
      `Auto-created from post-deployment check ${id}. Failed items: ${failDesc}`,
      now, now, now
    );
    createdWoIds.push(woId);
  }

  db.prepare(`
    INSERT INTO post_deployment_checks (id, organization_id, vehicle_id, trip_id, mechanic_id, mechanic_name, check_items, findings, work_order_ids, overall_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    orgId,
    body.vehicleId,
    body.tripId || null,
    body.mechanicId || "",
    body.mechanicName || "",
    JSON.stringify(checkItems),
    JSON.stringify(body.findings || []),
    JSON.stringify(createdWoIds),
    overallStatus,
    now
  );

  const row = db.prepare(`
    SELECT pdc.*, v.code as vehicle_code
    FROM post_deployment_checks pdc
    JOIN vehicles v ON pdc.vehicle_id = v.id
    WHERE pdc.id = ?
  `).get(id) as Record<string, unknown>;

  recordMutation(db, {
    entityType: "post_deployment_check",
    entityId: id,
    organizationId: orgId,
    action: "create",
    actor: auditActorFrom(user, {
      id: String(body.mechanicId || ""),
      name: String(body.mechanicName || ""),
    }),
    after: {
      vehicleId: body.vehicleId,
      tripId: body.tripId || null,
      overallStatus,
      linkedWorkOrders: createdWoIds.length,
    },
  });

  return NextResponse.json({
    ...row,
    check_items: typeof row.check_items === "string" ? JSON.parse(row.check_items as string) : row.check_items,
    findings: typeof row.findings === "string" ? JSON.parse(row.findings as string) : row.findings,
    work_order_ids: typeof row.work_order_ids === "string" ? JSON.parse(row.work_order_ids as string) : row.work_order_ids,
  }, { status: 201 });
}
