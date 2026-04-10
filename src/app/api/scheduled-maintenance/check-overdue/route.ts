import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

/**
 * POST /api/scheduled-maintenance/check-overdue
 *
 * Scans all upcoming scheduled maintenance entries and:
 * 1. Marks overdue ones (mileage exceeded or date passed)
 * 2. Auto-creates work orders for newly overdue items
 * 3. Returns a summary of what changed
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const upcoming = db.prepare(`
    SELECT sm.*, v.code as vehicle_code, v.total_mileage_km as current_mileage
    FROM scheduled_maintenance sm
    JOIN vehicles v ON sm.vehicle_id = v.id
    WHERE sm.organization_id = ? AND sm.status = 'upcoming'
  `).all(org) as Array<Record<string, unknown>>;

  let overdueCount = 0;
  let woCreated = 0;

  const txn = db.transaction(() => {
    for (const row of upcoming) {
      const currentKm = (row.current_mileage as number) || 0;
      const nextDueKm = (row.next_due_km as number) || 0;
      const nextDueDate = (row.next_due_date as string) || "";

      const kmOverdue = nextDueKm > 0 && currentKm >= nextDueKm;
      const dateOverdue = nextDueDate && today >= nextDueDate;

      if (kmOverdue || dateOverdue) {
        db.prepare(
          "UPDATE scheduled_maintenance SET status = 'overdue', updated_at = ? WHERE id = ?"
        ).run(now, row.id);
        overdueCount++;

        const existingWo = row.work_order_id;
        if (!existingWo) {
          const woId = uuidv4();
          const reason = kmOverdue
            ? `at ${currentKm.toLocaleString()} km (due at ${nextDueKm.toLocaleString()} km)`
            : `on ${today} (due ${nextDueDate})`;

          db.prepare(`
            INSERT INTO work_orders (id, organization_id, vehicle_id, title, description, type, priority, status, downtime_start, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'scheduled', 'medium', 'reported', ?, ?, ?)
          `).run(
            woId,
            org,
            row.vehicle_id,
            `Scheduled ${row.maintenance_type} — ${row.vehicle_code} overdue`,
            `Auto-created: ${row.maintenance_type} overdue ${reason}. ${row.description || ""}`.trim(),
            now, now, now
          );

          db.prepare(
            "UPDATE scheduled_maintenance SET work_order_id = ?, updated_at = ? WHERE id = ?"
          ).run(woId, now, row.id);
          woCreated++;
        }
      }
    }
  });

  txn();

  return NextResponse.json({
    scanned: upcoming.length,
    newlyOverdue: overdueCount,
    workOrdersCreated: woCreated,
  });
}
