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
    SELECT sm.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model,
           v.total_mileage_km as current_mileage
    FROM scheduled_maintenance sm
    JOIN vehicles v ON sm.vehicle_id = v.id
    WHERE sm.organization_id = ?
  `;
  const params: unknown[] = [org];

  const vehicleId = sp.get("vehicleId");
  if (vehicleId) { query += " AND sm.vehicle_id = ?"; params.push(vehicleId); }

  const status = sp.get("status");
  if (status) { query += " AND sm.status = ?"; params.push(status); }

  query += " ORDER BY CASE sm.status WHEN 'overdue' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END, sm.next_due_date ASC LIMIT 200";

  const rows = db.prepare(query).all(...params);
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  const db = getDb();
  const body = await request.json();
  const id = uuidv4();
  const now = new Date().toISOString();
  const orgId = body.organizationId || "1pwr_lesotho";

  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(body.vehicleId) as Record<string, unknown> | undefined;
  if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

  const intervalKm = body.intervalKm || (vehicle.service_interval_km as number) || 10000;
  const intervalMonths = body.intervalMonths || (vehicle.service_interval_months as number) || 6;
  const lastKm = body.lastPerformedKm || (vehicle.last_service_km as number) || (vehicle.total_mileage_km as number) || 0;
  const lastDate = body.lastPerformedDate || (vehicle.last_service_date as string) || now.slice(0, 10);

  const nextDueKm = lastKm + intervalKm;

  const lastDateObj = new Date(lastDate);
  lastDateObj.setMonth(lastDateObj.getMonth() + intervalMonths);
  const nextDueDate = lastDateObj.toISOString().slice(0, 10);

  const currentKm = (vehicle.total_mileage_km as number) || 0;
  const today = now.slice(0, 10);
  const isOverdue = currentKm >= nextDueKm || today >= nextDueDate;

  db.prepare(`
    INSERT INTO scheduled_maintenance (
      id, organization_id, vehicle_id, maintenance_type, description,
      interval_km, interval_months,
      last_performed_date, last_performed_km,
      next_due_date, next_due_km,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    orgId,
    body.vehicleId,
    body.maintenanceType || "full-service",
    body.description || "",
    intervalKm,
    intervalMonths,
    lastDate,
    lastKm,
    nextDueDate,
    nextDueKm,
    isOverdue ? "overdue" : "upcoming",
    now,
    now
  );

  const row = db.prepare(`
    SELECT sm.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM scheduled_maintenance sm
    JOIN vehicles v ON sm.vehicle_id = v.id
    WHERE sm.id = ?
  `).get(id) as Record<string, unknown>;

  recordMutation(db, {
    entityType: "scheduled_maintenance",
    entityId: id,
    organizationId: orgId,
    action: "create",
    actor: auditActorFrom(user, {}),
    after: {
      vehicleId: body.vehicleId,
      maintenanceType: body.maintenanceType || "full-service",
      status: row.status,
    },
  });

  return NextResponse.json(row, { status: 201 });
}
