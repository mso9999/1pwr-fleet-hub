#!/usr/bin/env tsx
/**
 * Find vehicles whose current status requires an open work order (maintenance-hq /
 * maintenance-3rdparty / awaiting-parts / grounded) but have none, and optionally
 * heal them by flipping the status to "diagnosis" with an audit trail entry.
 *
 * Default behaviour is dry-run: prints a CSV-style report to stdout and exits 0.
 *
 * Usage:
 *   tsx scripts/backfill-vehicle-status-vs-wo.ts            # dry-run, report only
 *   tsx scripts/backfill-vehicle-status-vs-wo.ts --apply    # flip to diagnosis + log
 *   tsx scripts/backfill-vehicle-status-vs-wo.ts --org 1pwr_zambia
 *
 * Status changes are written to status_log with reason = "auto-healed: no qualifying
 * open work order" and changed_by = "system-backfill". Re-running on a healed DB is a
 * no-op.
 */

import { getDb } from "../src/lib/db";
import {
  VEHICLE_STATUS,
  VEHICLE_STATUSES_REQUIRING_OPEN_WO,
} from "../src/types";

interface CliArgs {
  apply: boolean;
  org: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { apply: false, org: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") {
      args.apply = true;
    } else if (a === "--org") {
      args.org = argv[++i] ?? null;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: tsx scripts/backfill-vehicle-status-vs-wo.ts [--apply] [--org <organization_id>]"
      );
      process.exit(0);
    }
  }
  return args;
}

const OPEN_WO_STATUSES = [
  "submitted",
  "queued",
  "in-progress",
  "needs-parts",
  "pr-submitted",
  "awaiting-parts",
] as const;

interface VehicleRow {
  id: string;
  organization_id: string;
  code: string;
  status: string;
  open_wo_count: number;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();

  const placeholders = OPEN_WO_STATUSES.map(() => "?").join(", ");
  const enforcedStatuses = VEHICLE_STATUSES_REQUIRING_OPEN_WO;
  const statusPlaceholders = enforcedStatuses.map(() => "?").join(", ");

  const baseQuery = `
    SELECT v.id, v.organization_id, v.code, v.status,
           (SELECT COUNT(*) FROM work_orders wo
              WHERE wo.vehicle_id = v.id
                AND wo.status IN (${placeholders})) AS open_wo_count
    FROM vehicles v
    WHERE v.status IN (${statusPlaceholders})
    ${args.org ? "AND v.organization_id = ?" : ""}
    ORDER BY v.organization_id, v.code
  `;

  const params: unknown[] = [...OPEN_WO_STATUSES, ...enforcedStatuses];
  if (args.org) params.push(args.org);

  const candidates = db.prepare(baseQuery).all(...params) as VehicleRow[];
  const inconsistent = candidates.filter((r) => r.open_wo_count === 0);

  console.log(`# Vehicle status vs WO consistency check`);
  console.log(`# Total in enforced statuses: ${candidates.length}`);
  console.log(`# Inconsistent (no open WO):  ${inconsistent.length}`);
  console.log(`# Mode: ${args.apply ? "APPLY (flip to diagnosis)" : "DRY-RUN"}`);
  if (args.org) console.log(`# Organization filter: ${args.org}`);
  console.log("");

  if (inconsistent.length === 0) {
    console.log("No inconsistencies. Done.");
    return;
  }

  console.log("organization_id,vehicle_id,vehicle_code,status,open_wo_count");
  for (const row of inconsistent) {
    console.log(
      [
        row.organization_id,
        row.id,
        row.code,
        row.status,
        row.open_wo_count,
      ].join(","),
    );
  }

  if (!args.apply) {
    console.log("");
    console.log("Re-run with --apply to flip these to 'diagnosis' and log the change.");
    return;
  }

  console.log("");
  console.log("Applying healing transitions…");

  const flipStmt = db.prepare(
    "UPDATE vehicles SET status = ?, updated_at = datetime('now') WHERE id = ?"
  );
  const logStmt = db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at, reason) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)"
  );

  const reason = "auto-healed: no qualifying open work order";
  let healed = 0;

  const txn = db.transaction(() => {
    for (const row of inconsistent) {
      flipStmt.run(VEHICLE_STATUS.DIAGNOSIS, row.id);
      logStmt.run(
        "vehicle",
        row.id,
        row.status,
        VEHICLE_STATUS.DIAGNOSIS,
        "system-backfill",
        reason,
      );
      healed++;
    }
  });
  txn();

  console.log(`Healed ${healed} vehicle${healed === 1 ? "" : "s"} → status='diagnosis'.`);
}

main();
