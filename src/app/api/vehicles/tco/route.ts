import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";

  const rows = db.prepare(`
    SELECT 
      v.id as vehicle_id,
      v.code as vehicle_code,
      v.make as vehicle_make,
      v.model as vehicle_model,
      v.year as vehicle_year,
      v.fuel_type,
      v.transmission,
      v.asset_class,
      v.purchase_price,
      v.purchase_date,
      v.purchase_currency,
      v.residual_value,
      v.insurance_monthly,
      v.total_mileage_km,
      v.date_in_service,
      v.status as vehicle_status,
      COALESCE(SUM(wo.parts_cost), 0) as repair_parts_cost,
      COALESCE(SUM(wo.labour_cost), 0) as repair_labour_cost,
      COALESCE(SUM(wo.third_party_cost), 0) as repair_third_party_cost,
      COALESCE(SUM(wo.total_cost), 0) as total_repair_cost,
      COUNT(wo.id) as work_order_count,
      COALESCE(SUM(
        CASE WHEN wo.downtime_end IS NOT NULL 
          THEN CAST((julianday(wo.downtime_end) - julianday(wo.downtime_start)) AS INTEGER)
          ELSE CAST((julianday('now') - julianday(wo.downtime_start)) AS INTEGER)
        END
      ), 0) as total_downtime_days,
      CASE WHEN COUNT(wo.id) > 0 THEN
        COALESCE(SUM(
          CASE WHEN wo.downtime_end IS NOT NULL 
            THEN CAST((julianday(wo.downtime_end) - julianday(wo.downtime_start)) AS INTEGER)
            ELSE CAST((julianday('now') - julianday(wo.downtime_start)) AS INTEGER)
          END
        ), 0) * 1.0 / COUNT(wo.id)
      ELSE 0 END as avg_repair_days
    FROM vehicles v
    LEFT JOIN work_orders wo ON wo.vehicle_id = v.id
    WHERE v.organization_id = ?
    GROUP BY v.id
    ORDER BY total_repair_cost DESC
  `).all(org) as Array<Record<string, unknown>>;

  const tco = rows.map((r) => {
    const purchasePrice = (r.purchase_price as number) || 0;
    const totalRepairCost = (r.total_repair_cost as number) || 0;
    const residualValue = (r.residual_value as number) || 0;
    const insuranceMonthly = (r.insurance_monthly as number) || 0;
    const totalMileage = (r.total_mileage_km as number) || 0;
    const dateInService = (r.date_in_service as string) || (r.purchase_date as string) || "";

    let monthsInService = 0;
    if (dateInService) {
      const start = new Date(dateInService);
      monthsInService = Math.max(1, Math.round((Date.now() - start.getTime()) / (30.44 * 86400000)));
    }

    const totalInsurance = insuranceMonthly * monthsInService;
    const totalCostOfOwnership = purchasePrice + totalRepairCost + totalInsurance;
    const monthlyBurnRate = monthsInService > 0 ? totalCostOfOwnership / monthsInService : 0;
    const costPerKm = totalMileage > 0 ? totalCostOfOwnership / totalMileage : 0;

    let currentBookValue = purchasePrice;
    if (purchasePrice > 0 && monthsInService > 0) {
      const expectedLifeMonths = 60; // 5 years default
      const depreciation = ((purchasePrice - residualValue) / expectedLifeMonths) * monthsInService;
      currentBookValue = Math.max(residualValue, purchasePrice - depreciation);
    }

    const repairToValueRatio = purchasePrice > 0 ? totalRepairCost / purchasePrice : 0;

    return {
      vehicleId: r.vehicle_id,
      vehicleCode: r.vehicle_code,
      vehicleMake: r.vehicle_make,
      vehicleModel: r.vehicle_model,
      vehicleYear: r.vehicle_year,
      fuelType: r.fuel_type,
      transmission: r.transmission,
      assetClass: r.asset_class,
      vehicleStatus: r.vehicle_status,
      purchasePrice,
      purchaseCurrency: r.purchase_currency || "LSL",
      residualValue,
      totalMileageKm: totalMileage,
      monthsInService,
      repairPartsCost: r.repair_parts_cost,
      repairLabourCost: r.repair_labour_cost,
      repairThirdPartyCost: r.repair_third_party_cost,
      totalRepairCost,
      totalInsurance,
      totalCostOfOwnership,
      monthlyBurnRate: Math.round(monthlyBurnRate * 100) / 100,
      costPerKm: Math.round(costPerKm * 100) / 100,
      currentBookValue: Math.round(currentBookValue * 100) / 100,
      repairToValueRatio: Math.round(repairToValueRatio * 1000) / 1000,
      workOrderCount: r.work_order_count,
      totalDowntimeDays: r.total_downtime_days,
      avgRepairDays: Math.round((r.avg_repair_days as number) * 10) / 10,
    };
  });

  return NextResponse.json(tco);
}
