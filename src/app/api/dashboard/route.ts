import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { registrationDiscDashboardTier, calendarDaysUntil } from "@/lib/registration-disc";

export function GET(request: NextRequest): NextResponse {
  try {
  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const today = new Date().toISOString().slice(0, 10);

  // ── Vehicle status breakdown ──
  const statusCounts = db.prepare(
    "SELECT status, COUNT(*) as count FROM vehicles WHERE organization_id = ? GROUP BY status"
  ).all(org) as { status: string; count: number }[];

  const stats: Record<string, number> = {};
  let total = 0;
  for (const row of statusCounts) {
    stats[row.status] = row.count;
    total += row.count;
  }

  // ── Work order stats ──
  const openWorkOrders = db.prepare(
    "SELECT COUNT(*) as count FROM work_orders WHERE organization_id = ? AND status NOT IN ('completed', 'validated', 'closed', 'cancelled')"
  ).get(org) as { count: number };

  const avgRepair = db.prepare(
    "SELECT AVG(julianday(downtime_end) - julianday(downtime_start)) as avg_days FROM work_orders WHERE organization_id = ? AND downtime_end IS NOT NULL"
  ).get(org) as { avg_days: number | null };

  // ── KPIs ──
  const operationalDays = db.prepare(`
    SELECT COUNT(DISTINCT v.id) as vehicle_count,
           SUM(CASE WHEN v.status IN ('operational', 'deployed') THEN 1 ELSE 0 END) as up_count
    FROM vehicles v WHERE v.organization_id = ? AND v.status != 'written-off'
  `).get(org) as { vehicle_count: number; up_count: number };

  const fleetUptimePct = operationalDays.vehicle_count > 0
    ? Math.round((operationalDays.up_count / operationalDays.vehicle_count) * 1000) / 10
    : 0;

  const mtbf = db.prepare(`
    SELECT AVG(days_between) as avg_days FROM (
      SELECT vehicle_id,
        julianday(created_at) - LAG(julianday(created_at)) OVER (PARTITION BY vehicle_id ORDER BY created_at) as days_between
      FROM work_orders WHERE organization_id = ?
    ) WHERE days_between IS NOT NULL
  `).get(org) as { avg_days: number | null };

  // ── Active trips ──
  const activeTrips = db.prepare(`
    SELECT t.id, t.driver_name, t.destination, t.checkout_at, t.expected_return_at, t.mission_priority,
           v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM trips t JOIN vehicles v ON t.vehicle_id = v.id
    WHERE t.organization_id = ? AND t.checkin_at IS NULL ORDER BY t.checkout_at DESC
  `).all(org);

  // ── Recent open work orders ──
  const recentWorkOrders = db.prepare(`
    SELECT wo.id, wo.title, wo.status, wo.priority, wo.assigned_to, wo.created_at,
           v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model,
           CASE
             WHEN wo.downtime_start IS NULL OR trim(wo.downtime_start) = '' THEN 0
             ELSE CAST((julianday('now') - julianday(wo.downtime_start)) AS INTEGER)
           END as days_open
    FROM work_orders wo JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.organization_id = ? AND wo.status NOT IN ('completed', 'validated', 'closed', 'cancelled')
    ORDER BY CASE wo.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, wo.created_at DESC
    LIMIT 20
  `).all(org);

  // ── Alerts ──
  const alerts: Array<{ type: string; severity: string; message: string; entityId?: string }> = [];

  const overdueService = db.prepare(
    "SELECT COUNT(*) as cnt FROM scheduled_maintenance WHERE organization_id = ? AND status = 'overdue'"
  ).get(org) as { cnt: number };
  if (overdueService.cnt > 0) {
    alerts.push({ type: "maintenance-overdue", severity: "high", message: `${overdueService.cnt} vehicle(s) overdue for scheduled service` });
  }

  const longMaintenance = db.prepare(`
    SELECT v.code, CAST((julianday('now') - julianday(wo.downtime_start)) AS INTEGER) as days
    FROM work_orders wo JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.organization_id = ? AND wo.status NOT IN ('completed','validated','closed','cancelled')
      AND (julianday('now') - julianday(wo.downtime_start)) > 7
    ORDER BY days DESC LIMIT 5
  `).all(org) as Array<{ code: string; days: number }>;
  for (const r of longMaintenance) {
    alerts.push({ type: "long-maintenance", severity: "medium", message: `${r.code} in maintenance for ${r.days} days` });
  }

  const overdueTrips = db.prepare(`
    SELECT t.id, v.code, t.expected_return_at
    FROM trips t JOIN vehicles v ON t.vehicle_id = v.id
    WHERE t.organization_id = ? AND t.checkin_at IS NULL
      AND t.expected_return_at IS NOT NULL AND t.expected_return_at < ?
  `).all(org, new Date().toISOString()) as Array<{ id: string; code: string; expected_return_at: string }>;
  for (const t of overdueTrips) {
    alerts.push({ type: "trip-overdue", severity: "high", message: `${t.code} trip overdue (expected ${t.expected_return_at.slice(0, 10)})`, entityId: t.id });
  }

  const eolWarnings = db.prepare(
    "SELECT code FROM vehicles WHERE organization_id = ? AND eol_status IN ('monitor', 'end-of-life') ORDER BY eol_score DESC LIMIT 5"
  ).all(org) as Array<{ code: string }>;
  for (const v of eolWarnings) {
    alerts.push({ type: "eol-warning", severity: "medium", message: `${v.code} flagged for end-of-life review` });
  }

  const discRows = db
    .prepare(
      `SELECT id, code, registration_disc_expiry_date AS exp
       FROM vehicles
       WHERE organization_id = ?
         AND registration_disc_expiry_date IS NOT NULL
         AND trim(registration_disc_expiry_date) != ''
         AND length(trim(registration_disc_expiry_date)) >= 10
       ORDER BY registration_disc_expiry_date ASC
       LIMIT 24`
    )
    .all(org) as Array<{ id: string; code: string; exp: string }>;

  for (const row of discRows) {
    const exp = row.exp.trim().slice(0, 10);
    const tier = registrationDiscDashboardTier(today, exp);
    if (tier === "expired") {
      alerts.push({
        type: "registration-disc-expired",
        severity: "high",
        message: `${row.code}: registration disc expired (${exp})`,
        entityId: row.id,
      });
    } else if (tier === "within_30") {
      const days = calendarDaysUntil(today, exp) ?? 0;
      alerts.push({
        type: "registration-disc-30d",
        severity: "high",
        message: `${row.code}: registration disc expires in ${days} day(s) (${exp})`,
        entityId: row.id,
      });
    } else if (tier === "within_60") {
      const days = calendarDaysUntil(today, exp) ?? 0;
      alerts.push({
        type: "registration-disc-60d",
        severity: "medium",
        message: `${row.code}: registration disc expires in ${days} day(s) (${exp})`,
        entityId: row.id,
      });
    }
  }

  const pendingRequests = db.prepare(
    "SELECT COUNT(*) as cnt FROM vehicle_requests WHERE organization_id = ? AND status = 'requested'"
  ).get(org) as { cnt: number };
  if (pendingRequests.cnt > 0) {
    alerts.push({ type: "pending-requests", severity: "low", message: `${pendingRequests.cnt} vehicle request(s) awaiting approval` });
  }

  const checkoutHold = db.prepare(
    `SELECT COUNT(*) as cnt FROM missions
     WHERE organization_id = ? AND lower(COALESCE(lifecycle_status,'')) = 'checkout_hold'`
  ).get(org) as { cnt: number };
  if (checkoutHold.cnt > 0) {
    alerts.push({
      type: "mission-checkout-hold",
      severity: "high",
      message: `${checkoutHold.cnt} mission(s) on checkout hold — reserved vehicle not operational or fleet deferred; management action may be required (Missions / arbitration).`,
    });
  }

  // ── Recent activity ──
  const recentActivity = db.prepare(`
    SELECT 'trip_checkout' as event_type, t.driver_name as actor, v.code as vehicle_code,
           'checked out to ' || t.destination as description, t.checkout_at as event_at
    FROM trips t JOIN vehicles v ON t.vehicle_id = v.id
    WHERE t.organization_id = ? AND date(t.checkout_at) >= date(?, '-7 days')
    UNION ALL
    SELECT 'wo_created', wo.reported_by, v.code, wo.title, wo.created_at
    FROM work_orders wo JOIN vehicles v ON wo.vehicle_id = v.id
    WHERE wo.organization_id = ? AND date(wo.created_at) >= date(?, '-7 days')
    UNION ALL
    SELECT 'inspection', i.inspector_name, v.code,
           i.type || ' inspection' || CASE WHEN i.overall_pass = 0 THEN ' (FAILED)' ELSE '' END, i.created_at
    FROM inspections i JOIN vehicles v ON i.vehicle_id = v.id
    WHERE i.organization_id = ? AND date(i.created_at) >= date(?, '-7 days')
    UNION ALL
    SELECT 'vehicle_check', dvc.driver_name, v.code,
           dvc.direction || ' vehicle check' || CASE WHEN dvc.overall_pass = 0 THEN ' (FAILED)' ELSE '' END, dvc.created_at
    FROM driver_vehicle_checks dvc JOIN vehicles v ON dvc.vehicle_id = v.id
    WHERE dvc.organization_id = ? AND date(dvc.created_at) >= date(?, '-7 days')
    ORDER BY event_at DESC LIMIT 30
  `).all(org, today, org, today, org, today, org, today);

  return NextResponse.json({
    totalVehicles: total,
    operational: stats["operational"] || 0,
    deployed: stats["deployed"] || 0,
    maintenanceHq: stats["maintenance-hq"] || 0,
    maintenance3rd: stats["maintenance-3rdparty"] || 0,
    awaitingParts: stats["awaiting-parts"] || 0,
    grounded: stats["grounded"] || 0,
    writtenOff: stats["written-off"] || 0,
    openWorkOrders: openWorkOrders.count,
    avgRepairDays: avgRepair.avg_days ? Math.round(avgRepair.avg_days * 10) / 10 : 0,
    fleetUptimePct,
    mtbfDays: mtbf.avg_days ? Math.round(mtbf.avg_days * 10) / 10 : 0,
    activeTrips,
    recentWorkOrders,
    alerts,
    recentActivity,
  });
  } catch (err) {
    console.error("[dashboard] GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
