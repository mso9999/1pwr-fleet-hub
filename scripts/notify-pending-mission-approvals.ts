import { getDb } from "../src/lib/db";
import { notifyMissionApproversOfSubmission } from "../src/lib/mission-approval-notify";

/**
 * Backfill: email mission approvers about pending missions that were created
 * before approval notifications existed (or whose notification failed).
 *
 * A mission counts as already-notified when its mutation log holds an
 * approval_notify entry with ok:true. Everything else pending + active gets
 * one notification pass, recorded in the same log.
 *
 * Run locally:   npm run notify:pending-missions
 * Run on server: cd /var/www/fleet-hub && set -a && . ./.env && set +a \
 *                  && npx tsx scripts/notify-pending-mission-approvals.ts
 */
async function main(): Promise<void> {
  const db = getDb();
  const pending = db
    .prepare(
      `SELECT id, title, destination, departure_date, created_by_name, created_at
       FROM missions
       WHERE lower(COALESCE(approval_status, '')) = 'pending'
         AND lower(COALESCE(lifecycle_status, 'active')) = 'active'
       ORDER BY created_at`,
    )
    .all() as Array<{
    id: string;
    title: string;
    destination: string;
    departure_date: string;
    created_by_name: string;
    created_at: string;
  }>;

  if (pending.length === 0) {
    console.log("No pending missions.");
    return;
  }

  const notifiedStmt = db.prepare(
    `SELECT 1 FROM record_mutation_log
     WHERE entity_type = 'mission' AND entity_id = ? AND action = 'approval_notify'
       AND after_json LIKE '%"ok":true%' LIMIT 1`,
  );

  console.log(`Found ${pending.length} pending mission(s).`);
  for (const m of pending) {
    const already = notifiedStmt.get(m.id);
    if (already) {
      console.log(`- skip (already notified): ${m.title || m.destination} [${m.id.slice(0, 8)}]`);
      continue;
    }
    const outcome = await notifyMissionApproversOfSubmission(db, m.id, "backfill");
    if (outcome.ok) {
      console.log(
        `- notified ${outcome.recipients.join(", ")}: ${m.title || m.destination} ` +
          `(dep ${m.departure_date}, by ${m.created_by_name})`,
      );
    } else {
      console.error(
        `- FAILED ${m.title || m.destination} [${m.id.slice(0, 8)}]: ${outcome.error || outcome.skipped}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
