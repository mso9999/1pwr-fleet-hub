/**
 * Phase 2.5 — FM tests for stragglers, public-transport missions, and the
 * HR-canonical approval gate.
 *
 * Run with: npx tsx scripts/test-stragglers-and-public-transport.ts
 *
 * Uses an isolated temp-file SQLite DB so the production fleet-hub.db is
 * not touched. The DB_PATH env var must be set BEFORE importing
 * `src/lib/db` so the module-level constant picks it up.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-phase25-"));
const tmpDbPath = path.join(tmpDir, "test.db");
process.env.DB_PATH = tmpDbPath;

// Now import everything that depends on DB_PATH.
import { getDb } from "../src/lib/db";
import { insertPlannedMission } from "../src/lib/missions";
import { listDeploymentsForEmployee } from "../src/lib/deployments";
import { evaluateReadinessForMissionLinkedTrip } from "../src/lib/mission-deployment-readiness";
import {
  canApproveMissionRequests,
  canApproveVehicleCheckExceptions,
  canArbitrateMissionCapacity,
} from "../src/lib/vehicle-check-approvers";
import {
  setHrApprovalCacheForTest,
  clearHrApprovalCache,
  type HrToolsetApproval,
} from "../src/lib/hr-approval-roles";
import type { HrDirectoryEmployee } from "../src/lib/hr-directory-client";

const ORG = "1pwr_test";
const EMPLOYEE_ID = "1PWR9999";
const EMPLOYEE_ID_2 = "1PWR9998";

/** Build a minimal HrDirectoryEmployee with the fields the approval logic
 * actually inspects (role, toolset_approvals). Other interface fields are
 * stubbed so TypeScript is happy without dragging in a full HR fixture. */
function makeHrEmployee(
  email: string,
  role: string,
  approvals: HrToolsetApproval[],
): HrDirectoryEmployee & { toolset_approvals?: HrToolsetApproval[] } {
  return {
    id: 0,
    employee_id: null,
    name: email,
    email,
    role,
    type: "user",
    country: null,
    department: null,
    primary_deployment: null,
    current_position_title: null,
    employment_start_date: null,
    phone: null,
    headshot: null,
    status: "active",
    last_updated_at: null,
    toolset_approvals: approvals,
  };
}

function setupOrgAndVehicle(): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO organizations (id, name, code, country, currency, timezone_offset, active)
     VALUES (?, '1PWR Test', '1PWR_TEST', 'LS', 'LSL', 2, 1)`,
  ).run(ORG);
  // Seed a real vehicle so we can link a DVC and a trip to it.
  db.prepare(
    `INSERT OR IGNORE INTO vehicles (id, organization_id, code, make, model, license_plate, status, asset_class, is_synthetic)
     VALUES ('veh_test_1', ?, 'TEST-001', 'Toyota', 'Hilux', 'LS001', 'operational', '4wd', 0)`,
  ).run(ORG);
}

function approveMission(missionId: string): void {
  const db = getDb();
  db.prepare("UPDATE missions SET approval_status = 'approved' WHERE id = ?").run(missionId);
}

function startTripForMission(missionId: string, vehicleId: string): string {
  const db = getDb();
  const tripId = `trip_${missionId}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO trips (
       id, organization_id, vehicle_id, driver_id, driver_name, odo_start,
       departure_location, destination, mission_type, mission_profile, trip_shape,
       passengers, load_out, load_in, checkout_at, authorized_driver_verified,
       approved_drivers, loadout_manifest, expected_return_at, mission_priority,
       approval_status, approved_by, am_allocation_ids, mission_id, planned_departure_date,
       departed_at
     ) VALUES (?, ?, ?, '', '', 0, 'HQ', 'Site', 'other', 'local', 'one_way',
       '', '', '', ?, 0, '[]', '[]', NULL, 'normal',
       'auto-approved', '', '[]', ?, ?, ?)`,
  ).run(tripId, ORG, vehicleId, now, missionId, now.slice(0, 10), now);
  db.prepare("UPDATE missions SET trip_id = ? WHERE id = ?").run(tripId, missionId);
  return tripId;
}

async function main(): Promise<void> {
  const db = getDb();
  setupOrgAndVehicle();

  const results: Array<{ label: string; ok: boolean; detail?: unknown }> = [];

  // ---- Approval logic (HR-canonical, fleet_lead dropped) ----
  results.push({
    label: "canApproveMissionRequests false for fleet_lead",
    ok: !(await canApproveMissionRequests(db, ORG, "fleet_lead@example.com", "fleet_lead")),
  });
  clearHrApprovalCache();
  setHrApprovalCacheForTest(new Map([
    ["tumelo@example.com", makeHrEmployee("tumelo@example.com", "user", [{ toolset: "fm", approval_role: "mission_approver", scope_country_code: null, scope_organization_id: null }])],
  ]));
  results.push({
    label: "canApproveMissionRequests true for HR-canonical fm:mission_approver",
    ok: await canApproveMissionRequests(db, ORG, "tumelo@example.com", "user"),
  });
  results.push({
    label: "canApproveMissionRequests false for random user without grants",
    ok: !(await canApproveMissionRequests(db, ORG, "nobody@example.com", "user")),
  });
  results.push({
    label: "canApproveMissionRequests true for superadmin (break-glass)",
    ok: await canApproveMissionRequests(db, ORG, "msa@example.com", "superadmin"),
  });
  clearHrApprovalCache();

  results.push({
    label: "canApproveVehicleCheckExceptions true for fleet_lead (legacy)",
    ok: await canApproveVehicleCheckExceptions(db, ORG, "fleet_lead@example.com", "fleet_lead"),
  });
  results.push({
    label: "canArbitrateMissionCapacity false for fleet_lead",
    ok: !(await canArbitrateMissionCapacity(db, ORG, "fleet_lead@example.com", "fleet_lead")),
  });
  results.push({
    label: "canArbitrateMissionCapacity true for manager (legacy)",
    ok: await canArbitrateMissionCapacity(db, ORG, "manager@example.com", "manager"),
  });

  // ---- Scenario A: straggler passenger ----
  const stragglerMissionId = insertPlannedMission(db, {
    organizationId: ORG,
    title: "Straggler mission",
    destination: "Mokhotlong",
    departureDate: "2026-07-10",
    returnDate: "2026-07-12",
    missionType: "field",
    passengers: "",
    crewSize: 2,
    personnelManifest: [
      { employee_id: EMPLOYEE_ID, name: "Test Straggler", department: null, country: "LS", travel_mode: "straggler_public_transport", notes: "missed HQ departure; took public taxi to site" },
      { employee_id: EMPLOYEE_ID_2, name: "Test Rider", department: null, country: "LS", travel_mode: "on_vehicle" },
    ],
    loadoutSummary: "",
    notes: "",
    createdById: "test",
    createdByName: "Test",
    missionProfile: "field",
    requiredVehicleClass: "4wd",
  });
  approveMission(stragglerMissionId);
  db.prepare("UPDATE missions SET assigned_vehicle_id = 'veh_test_1' WHERE id = ?").run(stragglerMissionId);
  startTripForMission(stragglerMissionId, "veh_test_1");

  const stragglerDeployments = listDeploymentsForEmployee(db, { employeeId: EMPLOYEE_ID });
  const stragglerDep = stragglerDeployments.find((d) => d.source === "straggler_public_transport");
  results.push({
    label: "Straggler deployment detected with source=straggler_public_transport",
    ok: !!stragglerDep,
    detail: stragglerDep,
  });
  if (stragglerDep) {
    results.push({
      label: "Straggler deployment cites the linked mission id",
      ok: stragglerDep.mission_id === stragglerMissionId,
      detail: stragglerDep.mission_id,
    });
    results.push({
      label: "Straggler deployment carries the passenger note",
      ok: stragglerDep.notes === "missed HQ departure; took public taxi to site",
      detail: stragglerDep.notes,
    });
  }
  const riderDeployments = listDeploymentsForEmployee(db, { employeeId: EMPLOYEE_ID_2 });
  const riderStraggler = riderDeployments.find((d) => d.source === "straggler_public_transport");
  results.push({
    label: "On-vehicle passenger not flagged as straggler",
    ok: !riderStraggler,
  });

  // ---- Scenario B: public-transport mission ----
  const ptMissionId = insertPlannedMission(db, {
    organizationId: ORG,
    title: "Public transport mission",
    destination: "Qacha's Nek",
    departureDate: "2026-07-15",
    returnDate: "2026-07-17",
    missionType: "field",
    passengers: "",
    crewSize: 3,
    personnelManifest: [
      { employee_id: EMPLOYEE_ID, name: "PT Passenger 1", department: null, country: "LS", travel_mode: "on_vehicle" },
      { employee_id: EMPLOYEE_ID_2, name: "PT Passenger 2", department: null, country: "LS", travel_mode: "on_vehicle" },
    ],
    loadoutSummary: "",
    notes: "",
    createdById: "test",
    createdByName: "Test",
    missionProfile: "field",
    requiredVehicleClass: "4wd", // should be ignored / forced empty
    transportMode: "public_transport",
    publicTransportJustification: "No 4WD vehicles available for the Maseru to Qacha's Nek route on this date.",
  });
  approveMission(ptMissionId);
  const ptMission = db.prepare("SELECT * FROM missions WHERE id = ?").get(ptMissionId) as Record<string, unknown>;
  results.push({
    label: "Public-transport mission persisted transport_mode",
    ok: ptMission.transport_mode === "public_transport",
    detail: ptMission.transport_mode,
  });
  results.push({
    label: "Public-transport mission forced required_vehicle_class to empty",
    ok: ptMission.required_vehicle_class === "",
    detail: ptMission.required_vehicle_class,
  });
  results.push({
    label: "Public-transport mission stored the justification",
    ok: String(ptMission.public_transport_justification || "").length >= 20,
    detail: ptMission.public_transport_justification,
  });
  // Sentinel vehicle is seeded by the migration for ORG.
  const sentinelVehicleId = `public_transport_${ORG}`;
  const sentinel = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(sentinelVehicleId) as Record<string, unknown> | undefined;
  results.push({
    label: "Public-transport sentinel vehicle seeded",
    ok: !!sentinel && sentinel.code === "PUBLIC-TRANSPORT" && Number(sentinel.is_synthetic) === 1,
    detail: sentinel,
  });

  // Readiness: public-transport mission skips vehicle gates entirely.
  const ptReadiness = evaluateReadinessForMissionLinkedTrip(db, {
    organizationId: ORG,
    missionId: ptMissionId,
    vehicleId: sentinelVehicleId,
  });
  results.push({
    label: "Public-transport mission readiness ok=true",
    ok: ptReadiness.ok,
    detail: ptReadiness.gates,
  });
  results.push({
    label: "Public-transport readiness exposes transportMode",
    ok: ptReadiness.transportMode === "public_transport",
    detail: ptReadiness.transportMode,
  });
  results.push({
    label: "Public-transport readiness skips mission_vehicle gate",
    ok: !ptReadiness.gates.some((g) => g.id === "mission_vehicle"),
  });

  // Trip checkout for public-transport mission uses the sentinel vehicle.
  const ptTripId = startTripForMission(ptMissionId, sentinelVehicleId);
  const ptTrip = db.prepare("SELECT * FROM trips WHERE id = ?").get(ptTripId) as Record<string, unknown>;
  results.push({
    label: "Public-transport trip references sentinel vehicle",
    ok: ptTrip.vehicle_id === sentinelVehicleId,
    detail: ptTrip.vehicle_id,
  });

  // Deployments API surfaces public-transport deployment with source=public_transport_mission.
  const ptDeployments = listDeploymentsForEmployee(db, { employeeId: EMPLOYEE_ID });
  const ptDep = ptDeployments.find(
    (d) => d.source === "public_transport_mission" && d.mission_id === ptMissionId,
  );
  results.push({
    label: "Public-transport deployment detected",
    ok: !!ptDep,
    detail: ptDep,
  });
  if (ptDep) {
    results.push({
      label: "Public-transport deployment has vehicle=null",
      ok: ptDep.vehicle === null,
    });
    results.push({
      label: "Public-transport deployment anchored on trip departed_at",
      ok: !!ptDep.deployment_start_date,
      detail: ptDep.deployment_start_date,
    });
  }

  // Sentinel filtered from GET /api/vehicles-style listing (use the same
  // filter expression the route applies).
  const visibleVehicles = db
    .prepare("SELECT * FROM vehicles WHERE organization_id = ? AND COALESCE(is_synthetic, 0) = 0")
    .all(ORG) as Array<Record<string, unknown>>;
  results.push({
    label: "Sentinel vehicle filtered from vehicle listing",
    ok: !visibleVehicles.some((v) => v.id === sentinelVehicleId),
    detail: visibleVehicles.length,
  });

  // ---- Report ----
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.label}${r.detail !== undefined ? ` — ${JSON.stringify(r.detail)}` : ""}`);
  }
  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.error(`\n${failures.length} test(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} Phase 2.5 tests passed.`);

  // Cleanup.
  try {
    db.close();
  } catch {
    // ignore
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

main().catch((err) => {
  console.error("Phase 2.5 test runner failed:", err);
  process.exit(1);
});
