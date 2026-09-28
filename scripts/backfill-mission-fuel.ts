#!/usr/bin/env tsx
/**
 * Recompute the stored fuel budget on active company-vehicle missions that have not
 * yet returned (draft / pending / approved, return date today or later).
 *
 * Default is dry-run: prints old vs new km / litres / budget per mission.
 *
 * Usage:
 *   DB_PATH=/var/www/fleet-hub/data/fleet-hub.db npx tsx scripts/backfill-mission-fuel.ts
 *   DB_PATH=... npx tsx scripts/backfill-mission-fuel.ts --apply
 *   DB_PATH=... npx tsx scripts/backfill-mission-fuel.ts --mission <id> --apply
 */

import { getDb } from "../src/lib/db";
import { recomputeMissionFuel } from "../src/lib/fuel-estimate";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const mi = argv.indexOf("--mission");
  const onlyMission = mi >= 0 ? argv[mi + 1] : null;

  const db = getDb();
  const rows = (
    onlyMission
      ? db.prepare("SELECT * FROM missions WHERE id = ?").all(onlyMission)
      : db
          .prepare(
            `SELECT * FROM missions
             WHERE status = 'planned'
               AND lower(COALESCE(approval_status, '')) IN ('draft', 'pending', 'approved', 'revision_requested')
               AND lower(COALESCE(lifecycle_status, 'active')) = 'active'
               AND lower(COALESCE(transport_mode, 'company_vehicle')) = 'company_vehicle'
               AND date(COALESCE(NULLIF(return_date, ''), departure_date)) >= date('now')
             ORDER BY departure_date`
          )
          .all()
  ) as Array<Record<string, unknown>>;

  console.log(`${apply ? "APPLY" : "DRY-RUN"}: ${rows.length} mission(s)`);
  for (const m of rows) {
    const id = String(m.id);
    try {
      const snap = await recomputeMissionFuel(db, id, { write: apply });
      console.log(
        [
          id,
          String(m.title || m.destination).slice(0, 40),
          m.departure_date,
          `km ${m.fuel_total_km ?? "-"} -> ${snap?.fuel_total_km ?? "-"}`,
          `L ${m.fuel_liters ?? "-"} -> ${snap?.fuel_liters ?? "-"}`,
          `budget ${m.fuel_budget ?? "-"} -> ${snap?.fuel_budget ?? "-"} ${snap?.fuel_currency ?? ""}`,
        ].join(" | ")
      );
    } catch (e) {
      console.error(`${id} | FAILED | ${String(e)}`);
    }
  }
}

void main();
