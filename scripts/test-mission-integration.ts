import { getDb, ensureMissionsTableAndVehicleRequestMissionId } from "../src/lib/db";

/**
 * Lightweight local smoke-check for the HR mission integration schema.
 * Run with: npm run test:mission-integration
 */
function main(): void {
  const db = getDb();
  ensureMissionsTableAndVehicleRequestMissionId(db);
  const cols = db.prepare("PRAGMA table_info(missions)").all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  const required = [
    "hr_request_id",
    "hr_request_status",
    "hr_sync_source",
    "hr_source_updated_at",
    "approval_source",
  ];
  const missing = required.filter((r) => !names.has(r));
  if (missing.length > 0) {
    console.error("Missing mission integration columns:", missing);
    process.exit(1);
  }
  console.log("Mission integration schema OK.");
}

main();

