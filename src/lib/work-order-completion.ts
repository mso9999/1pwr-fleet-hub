/**
 * Labor-capture gate for work-order completion (2026-08-21).
 *
 * Completing a work order requires logged effort: in-house work (hq / field)
 * needs at least one labor line with hours > 0; third-party repairs are exempt
 * because their cost is captured via the 3rd-party quote/invoice fields.
 *
 * This is the effort half of the per-vehicle cost record feeding
 * retire-vs-keep decisions — the PR↔WO gate covers parts, this covers labor.
 */
import type Database from "better-sqlite3";

export interface LaborGateResult {
  ok: boolean;
  reason?: string;
}

export function laborGateForCompletion(
  db: Database.Database,
  workOrder: { id: string; repair_location?: string | null },
): LaborGateResult {
  const isThirdParty = String(workOrder.repair_location || "") === "3rd-party";
  if (isThirdParty) return { ok: true };

  const row = db
    .prepare("SELECT COUNT(*) AS c FROM work_order_labor WHERE work_order_id = ? AND hours > 0")
    .get(workOrder.id) as { c: number };
  if (Number(row?.c ?? 0) > 0) return { ok: true };

  return {
    ok: false,
    reason:
      "Completing this work order requires logged effort: add at least one labor line (worker + hours) in the Labor section first. Third-party repairs are exempt — set Repair location to 3rd-party.",
  };
}
