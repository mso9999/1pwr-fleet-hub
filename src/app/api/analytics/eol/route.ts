import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * GET /api/analytics/eol
 *
 * Computes end-of-life scores for all vehicles. Composite 0-100 score:
 *   Age vs expected life (20%), Mileage vs expected life (20%),
 *   Repair frequency (15%), Repair cost ratio (20%),
 *   Downtime ratio (15%), Recurring failures (10%).
 *
 * Bands: 0-40 Active, 41-70 Monitor, 71-100 End-of-life
 */
export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";

  const vehicles = db.prepare(`
    SELECT v.*,
      COALESCE(SUM(wo.total_cost), 0) as cumulative_repair_cost,
      COUNT(wo.id) as wo_count,
      COALESCE(SUM(
        CASE WHEN wo.downtime_end IS NOT NULL 
          THEN julianday(wo.downtime_end) - julianday(wo.downtime_start)
          ELSE julianday('now') - julianday(wo.downtime_start)
        END
      ), 0) as total_downtime_days
    FROM vehicles v
    LEFT JOIN work_orders wo ON wo.vehicle_id = v.id
    WHERE v.organization_id = ?
    GROUP BY v.id
  `).all(org) as Array<Record<string, unknown>>;

  if (vehicles.length === 0) return NextResponse.json([]);

  const avgWoCount = vehicles.reduce((s, v) => s + ((v.wo_count as number) || 0), 0) / vehicles.length;

  const results = vehicles.map((v) => {
    const dateInService = (v.date_in_service as string) || (v.purchase_date as string) || (v.created_at as string);
    const yearsInService = dateInService
      ? Math.max(0.1, (Date.now() - new Date(dateInService).getTime()) / (365.25 * 86400000))
      : 1;
    const daysInService = yearsInService * 365.25;

    const expectedLifeYears = (v.expected_service_life_years as number) || 10;
    const expectedLifeKm = (v.expected_service_life_km as number) || 300000;
    const totalMileage = (v.total_mileage_km as number) || 0;
    const purchasePrice = (v.purchase_price as number) || 0;
    const repairCost = (v.cumulative_repair_cost as number) || 0;
    const woCount = (v.wo_count as number) || 0;
    const downtimeDays = (v.total_downtime_days as number) || 0;

    // Factor 1: Age ratio (20%)
    const ageRatio = Math.min(1, yearsInService / expectedLifeYears);
    const ageScore = ageRatio * 100;

    // Factor 2: Mileage ratio (20%)
    const mileageRatio = expectedLifeKm > 0 ? Math.min(1, totalMileage / expectedLifeKm) : 0;
    const mileageScore = mileageRatio * 100;

    // Factor 3: Repair frequency vs fleet average (15%)
    const woPerYear = woCount / yearsInService;
    const avgWoPerYear = avgWoCount / Math.max(1, yearsInService);
    const freqScore = avgWoPerYear > 0 ? Math.min(100, (woPerYear / avgWoPerYear) * 50) : 0;

    // Factor 4: Repair cost / purchase price ratio (20%)
    const costRatio = purchasePrice > 0 ? Math.min(1, repairCost / purchasePrice) : 0;
    const costScore = costRatio * 100;

    // Factor 5: Downtime ratio (15%)
    const downtimeRatio = daysInService > 0 ? Math.min(1, downtimeDays / daysInService) : 0;
    const downtimeScore = downtimeRatio * 100;

    // Factor 6: Recurring failures — count WO categories appearing 3+ times (10%)
    const categoryWOs = db.prepare(`
      SELECT type, COUNT(*) as cnt FROM work_orders WHERE vehicle_id = ? GROUP BY type HAVING cnt >= 3
    `).all(v.id) as Array<{ type: string; cnt: number }>;
    const recurringScore = Math.min(100, categoryWOs.length * 33);

    const compositeScore = Math.round(
      ageScore * 0.20 +
      mileageScore * 0.20 +
      freqScore * 0.15 +
      costScore * 0.20 +
      downtimeScore * 0.15 +
      recurringScore * 0.10
    );

    const band = compositeScore <= 40 ? "active" : compositeScore <= 70 ? "monitor" : "end-of-life";

    return {
      vehicleId: v.id,
      vehicleCode: v.code,
      vehicleMake: v.make,
      vehicleModel: v.model,
      vehicleYear: v.year,
      vehicleStatus: v.status,
      eolScore: compositeScore,
      eolBand: band,
      factors: {
        ageScore: Math.round(ageScore),
        mileageScore: Math.round(mileageScore),
        repairFrequencyScore: Math.round(freqScore),
        repairCostScore: Math.round(costScore),
        downtimeScore: Math.round(downtimeScore),
        recurringFailureScore: Math.round(recurringScore),
      },
      details: {
        yearsInService: Math.round(yearsInService * 10) / 10,
        totalMileageKm: totalMileage,
        purchasePrice,
        cumulativeRepairCost: repairCost,
        repairToValueRatio: Math.round(costRatio * 1000) / 1000,
        workOrderCount: woCount,
        totalDowntimeDays: Math.round(downtimeDays),
        recurringCategories: categoryWOs.map((c) => c.type),
      },
    };
  });

  results.sort((a, b) => b.eolScore - a.eolScore);

  // Update eol_score and eol_status on each vehicle record
  const updateStmt = db.prepare("UPDATE vehicles SET eol_score = ?, eol_status = ? WHERE id = ?");
  const txn = db.transaction(() => {
    for (const r of results) {
      updateStmt.run(r.eolScore, r.eolBand, r.vehicleId);
    }
  });
  txn();

  return NextResponse.json(results);
}
