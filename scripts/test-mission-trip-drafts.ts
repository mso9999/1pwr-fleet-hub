import { getDb, ensureMissionsTableAndVehicleRequestMissionId } from "../src/lib/db";
import { canViewPrivateDraft } from "../src/lib/fleet-roles";

/**
 * Lightweight schema/ACL smoke-check for mission/trip draft workflow.
 * Run with: npm run test:mission-trip-drafts
 */
function main(): void {
  const db = getDb();
  ensureMissionsTableAndVehicleRequestMissionId(db);

  const missionCols = db.prepare("PRAGMA table_info(missions)").all() as Array<{ name: string }>;
  const missionNames = new Set(missionCols.map((c) => c.name));
  const missionRequired = ["approval_status", "created_by_id", "created_at"];
  const missingMission = missionRequired.filter((c) => !missionNames.has(c));
  if (missingMission.length > 0) {
    console.error("Missing mission draft columns:", missingMission);
    process.exit(1);
  }

  const draftTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='trip_drafts'")
    .get() as { name: string } | undefined;
  if (!draftTable) {
    console.error("trip_drafts table not found.");
    process.exit(1);
  }

  const aclAssertions: Array<{ ok: boolean; label: string }> = [
    {
      label: "creator can view",
      ok: canViewPrivateDraft({ role: "driver", department: "", isCreator: true }),
    },
    {
      label: "admin can view",
      ok: canViewPrivateDraft({ role: "admin", department: "", isCreator: false }),
    },
    {
      label: "IT can view",
      ok: canViewPrivateDraft({ role: "driver", department: "IT Support", isCreator: false }),
    },
    {
      label: "fleet_lead cannot view by role alone",
      ok: !canViewPrivateDraft({ role: "fleet_lead", department: "Fleet", isCreator: false }),
    },
    {
      label: "manager cannot view by role alone",
      ok: !canViewPrivateDraft({ role: "manager", department: "Operations", isCreator: false }),
    },
  ];

  const failed = aclAssertions.filter((a) => !a.ok);
  if (failed.length > 0) {
    console.error("Draft ACL assertions failed:", failed.map((f) => f.label));
    process.exit(1);
  }

  console.log("Mission/trip draft schema + ACL checks OK.");
}

main();
