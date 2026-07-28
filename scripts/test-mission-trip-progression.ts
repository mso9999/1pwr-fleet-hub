import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-progression-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
const ORG = "progression_test";
const VEHICLE = "veh_progression";

function trip(
  db: Database.Database,
  id: string,
  vehicleId: string,
  checkoutAt: string,
  departedAt: string | null,
  checkinAt: string | null,
  missionId: string | null = null
): void {
  db.prepare(
    `INSERT INTO trips (
       id, organization_id, vehicle_id, driver_id, driver_name, odo_start,
       departure_location, destination, mission_type, mission_profile, trip_shape,
       passengers, load_out, load_in, checkout_at, departed_at, checkin_at, mission_id
     ) VALUES (?, ?, ?, '', '', 0, 'HQ', 'FAR', 'field', 'field', 'one_way',
               '', '', '', ?, ?, ?, ?)`
  ).run(id, ORG, vehicleId, checkoutAt, departedAt, checkinAt, missionId);
}

async function main(): Promise<void> {
  const [{ getDb }, { insertPlannedMission }, checkout, locality, readiness] =
    await Promise.all([
      import("../src/lib/db"),
      import("../src/lib/missions"),
      import("../src/lib/mission-checkout"),
      import("../src/lib/locality-gate"),
      import("../src/lib/mission-deployment-readiness"),
    ]);
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO organizations (
       id,name,code,country,currency,timezone_offset,active,route_origin_lat,route_origin_lng
     ) VALUES (?, 'Test','T','LS','LSL',2,1,0,0)`
  ).run(ORG);
  db.prepare(
    `INSERT OR REPLACE INTO reference_data (
       id,organization_id,type,code,label,active,meta
     ) VALUES
       ('near',?,'site','NEAR','Near',1,'{"lat":0.1,"lng":0.1}'),
       ('far',?,'site','FAR','Far',1,'{"lat":1,"lng":1}')`
  ).run(ORG, ORG);
  db.prepare(
    `INSERT INTO vehicles (
       id,organization_id,code,make,model,license_plate,status,asset_class,is_synthetic
     ) VALUES (?,?,'PROG-1','Toyota','Hilux','TEST','operational','4wd',0)`
  ).run(VEHICLE, ORG);

  assert.equal(locality.localityGateRequired(db, ORG, VEHICLE, "NEAR").required, false);
  assert.equal(locality.localityGateRequired(db, ORG, VEHICLE, "FAR").inspectionOnFile, false);
  db.prepare(
    `INSERT INTO inspections (
       id,organization_id,vehicle_id,type,items,overall_pass,created_at,updated_at
     ) VALUES ('old',?,?,'detailed','{}',1,'2026-07-01T08:00:00Z','2026-07-01T08:00:00Z')`
  ).run(ORG, VEHICLE);
  assert.equal(locality.localityGateRequired(db, ORG, VEHICLE, "FAR").inspectionOnFile, true);
  trip(db, "completed", VEHICLE, "2026-07-10T08:00:00Z", null, "2026-07-11T08:00:00Z");
  assert.equal(locality.localityGateRequired(db, ORG, VEHICLE, "FAR").inspectionOnFile, false);
  db.prepare(
    `INSERT INTO inspections (
       id,organization_id,vehicle_id,type,items,overall_pass,created_at,updated_at
     ) VALUES ('new',?,?,'detailed','{}',1,'2026-07-12T08:00:00Z','2026-07-12T08:00:00Z')`
  ).run(ORG, VEHICLE);
  trip(db, "planned_ignored", VEHICLE, "2026-07-20T08:00:00Z", null, null);
  assert.equal(
    locality.localityGateRequired(db, ORG, VEHICLE, "FAR").lastDeploymentAt,
    "2026-07-10T08:00:00Z"
  );

  const missionId = insertPlannedMission(db, {
    organizationId: ORG,
    title: "Mission",
    destination: "FAR",
    departureDate: "2026-07-30",
    returnDate: "2026-08-01",
    missionType: "field",
    passengers: "",
    loadoutSummary: "",
    notes: "",
    createdById: "u",
    createdByName: "U",
    missionProfile: "field",
    requiredVehicleClass: "4wd",
  });
  db.prepare("UPDATE missions SET approval_status='approved' WHERE id=?").run(missionId);
  assert.equal(checkout.assertMissionEligibleForTripCreation(db, ORG, missionId).ok, true);
  assert.equal(
    checkout.assertMissionHasPlannedTripForVehicleAllocation(db, ORG, missionId).ok,
    false
  );
  const sentinel = checkout.ensureUnallocatedVehicle(db, ORG);
  trip(db, "mission_trip", sentinel, "2026-07-28T12:00:00Z", null, null, missionId);
  db.prepare("UPDATE missions SET trip_id=? WHERE id=?").run("mission_trip", missionId);
  assert.equal(
    checkout.assertMissionHasPlannedTripForVehicleAllocation(db, ORG, missionId).ok,
    true
  );
  checkout.syncAllocatedVehicleToPlannedTrip(db, missionId, VEHICLE);
  db.prepare("UPDATE missions SET assigned_vehicle_id=? WHERE id=?").run(VEHICLE, missionId);

  db.prepare(
    `INSERT INTO driver_vehicle_checks (
       id,organization_id,vehicle_id,trip_id,direction,overall_pass,check_date,created_at,updated_at
     ) VALUES (
       'wrong',?,?,'planned_ignored','departing',1,'2026-07-28',
       '2026-07-28T13:00:00Z','2026-07-28T13:00:00Z'
     )`
  ).run(ORG, VEHICLE);
  let result = readiness.evaluateReadinessForMissionLinkedTrip(db, {
    organizationId: ORG,
    missionId,
    vehicleId: VEHICLE,
    checkDate: "2026-07-28",
    referenceNow: new Date("2026-07-28T13:30:00Z"),
  });
  assert.equal(result.gates.find((gate) => gate.id === "driver_checklist")?.status, "blocked");

  db.prepare(
    `INSERT INTO driver_vehicle_checks (
       id,organization_id,vehicle_id,trip_id,direction,overall_pass,check_date,created_at,updated_at
     ) VALUES (
       'right',?,?,'mission_trip','departing',1,'2026-07-28',
       '2026-07-28T13:15:00Z','2026-07-28T13:15:00Z'
     )`
  ).run(ORG, VEHICLE);
  result = readiness.evaluateReadinessForMissionLinkedTrip(db, {
    organizationId: ORG,
    missionId,
    vehicleId: VEHICLE,
    checkDate: "2026-07-28",
    referenceNow: new Date("2026-07-28T13:30:00Z"),
  });
  assert.equal(result.gates.find((gate) => gate.id === "driver_checklist")?.status, "satisfied");

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("Mission -> trip -> Fleet allocation -> checklist progression OK.");
}

main().catch((error) => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
});
