import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  bandFromScore,
  computeTriageScore,
  scoreDaysWaiting,
  scoreHqSkillMatch,
  scoreOperationalUrgency,
  scorePartsReady,
  type TriageRow,
} from "@/lib/triage";

const TERMINAL = "('completed','validated','closed','cancelled','rejected')";

export function GET(request: NextRequest): NextResponse {
  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";
  const maxBays = Math.max(1, Math.min(20, parseInt(searchParams.get("maxBays") || "4", 10) || 4));

  const db = getDb();

  const orders = db
    .prepare(
      `
    SELECT wo.id, wo.title, wo.description, wo.status, wo.priority, wo.repair_location,
           wo.assigned_to, wo.downtime_start, wo.created_at,
           v.code as vehicle_code, v.asset_class, v.status as vehicle_status
    FROM work_orders wo
    JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.organization_id = ?
      AND wo.status NOT IN ${TERMINAL}
      AND wo.repair_location IN ('hq', 'field')
    ORDER BY wo.downtime_start ASC
  `
    )
    .all(org) as Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    repair_location: string;
    assigned_to: string;
    downtime_start: string;
    created_at: string;
    vehicle_code: string;
    asset_class: string;
    vehicle_status: string;
  }>;

  const partStmt = db.prepare("SELECT pr_status FROM parts WHERE work_order_id = ?");

  const rows: TriageRow[] = [];

  for (const wo of orders) {
    const partRows = partStmt.all(wo.id) as Array<{ pr_status: string }>;
    const p = scorePartsReady(partRows);
    const u = scoreOperationalUrgency(wo.vehicle_status, wo.priority);
    const h = scoreHqSkillMatch(wo.title, wo.description || "", wo.asset_class || "");
    const start = wo.downtime_start || wo.created_at;
    const daysRaw =
      (Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
    const days = Math.max(0, Math.floor(daysRaw));
    const d = scoreDaysWaiting(days);

    const factors = {
      partsReady: p.score,
      operationalUrgency: u.score,
      hqSkillMatch: h.score,
      daysWaiting: d.score,
    };
    const score = computeTriageScore(factors);
    const band = bandFromScore(score);
    const notes = [p.notes, u.notes, h.notes, d.notes].filter(Boolean).join(" · ");

    rows.push({
      workOrderId: wo.id,
      vehicleCode: wo.vehicle_code,
      title: wo.title,
      status: wo.status,
      priority: wo.priority,
      repairLocation: wo.repair_location,
      assignedTo: wo.assigned_to || "",
      assetClass: wo.asset_class || "",
      vehicleStatus: wo.vehicle_status || "",
      daysWaiting: days,
      score,
      band,
      factors,
      notes,
    });
  }

  rows.sort((a, b) => b.score - a.score);

  const hqActive = rows.filter((r) => r.repairLocation === "hq" || r.repairLocation === "field");
  const overCapacity = hqActive.length > maxBays;
  const lowestForFlag = [...hqActive].sort((a, b) => a.score - b.score);
  const flaggedIds = overCapacity ? lowestForFlag.slice(0, hqActive.length - maxBays).map((r) => r.workOrderId) : [];

  return NextResponse.json({
    organizationId: org,
    maxBays,
    hqQueueCount: hqActive.length,
    overCapacity,
    flaggedLowPriorityIds: flaggedIds,
    rows,
  });
}
