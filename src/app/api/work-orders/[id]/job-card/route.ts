import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * GET /api/work-orders/[id]/job-card
 *
 * Returns a structured JSON payload suitable for rendering a printable job card.
 * Includes: vehicle info, work order details, status history, labor log, parts,
 * PO links, updates, and media attachment URLs.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();

  const wo = db.prepare(`
    SELECT wo.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model,
           v.year as vehicle_year, v.license_plate, v.vin, v.asset_class
    FROM work_orders wo
    JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!wo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const statusHistory = db.prepare(
    "SELECT * FROM work_order_status_history WHERE work_order_id = ? ORDER BY changed_at ASC"
  ).all(id);

  const labor = db.prepare(
    "SELECT * FROM work_order_labor WHERE work_order_id = ? ORDER BY work_date ASC"
  ).all(id);

  const parts = db.prepare(
    "SELECT * FROM parts WHERE work_order_id = ?"
  ).all(id);

  const poLinks = db.prepare(
    "SELECT * FROM work_order_po_links WHERE work_order_id = ?"
  ).all(id);

  const updates = db.prepare(
    "SELECT * FROM work_order_updates WHERE work_order_id = ? ORDER BY created_at ASC"
  ).all(id);

  const media = db.prepare(
    "SELECT * FROM media_attachments WHERE entity_type = 'work_order' AND entity_id = ? ORDER BY created_at ASC"
  ).all(id);

  const downtimeDays = wo.downtime_end
    ? Math.ceil(
        (new Date(wo.downtime_end as string).getTime() - new Date(wo.downtime_start as string).getTime()) / 86400000
      )
    : Math.ceil(
        (Date.now() - new Date(wo.downtime_start as string).getTime()) / 86400000
      );

  return NextResponse.json({
    jobCard: {
      workOrder: wo,
      vehicle: {
        code: wo.vehicle_code,
        make: wo.vehicle_make,
        model: wo.vehicle_model,
        year: wo.vehicle_year,
        licensePlate: wo.license_plate,
        vin: wo.vin,
        assetClass: wo.asset_class,
      },
      statusHistory,
      labor,
      parts,
      poLinks,
      updates,
      media: (media as Array<Record<string, unknown>>).map((m) => ({
        id: m.id,
        fileName: m.file_name,
        originalName: m.original_name,
        category: m.category,
        caption: m.caption,
      })),
      summary: {
        totalLabourHours: wo.total_labour_hours,
        partsCost: wo.parts_cost,
        labourCost: wo.labour_cost,
        thirdPartyCost: wo.third_party_cost,
        totalCost: wo.total_cost,
        downtimeDays,
      },
      generatedAt: new Date().toISOString(),
    },
  });
}
