import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fleet-eligible-dep-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");

const ORG = "eligible_dep_org";
const VEHICLE = "veh_mak_1";
const OTHER_VEHICLE = "veh_other";
const TODAY = "2026-08-27";

function insertVehicle(db: Database.Database, id: string, code: string): void {
  db.prepare(
    `INSERT INTO vehicles (
       id,organization_id,code,make,model,license_plate,status,asset_class,is_synthetic
     ) VALUES (?,?,'${code}','Toyota','Hilux','TEST','operational','4wd',0)`
  ).run(id, ORG);
}

function insertTrip(
  db: Database.Database,
  id: string,
  vehicleId: string,
  missionId: string,
  checkoutAt: string
): void {
  db.prepare(
    `INSERT INTO trips (
       id, organization_id, vehicle_id, driver_id, driver_name, odo_start,
       departure_location, destination, mission_type, mission_profile, trip_shape,
       passengers, load_out, load_in, checkout_at, departed_at, checkin_at, mission_id,
       planned_departure_date
     ) VALUES (?, ?, ?, '', '', 0, 'HQ', 'MAK', 'field', 'field', 'one_way',
               '', '', '', ?, NULL, NULL, ?, ?)`
  ).run(id, ORG, vehicleId, checkoutAt, missionId, TODAY);
}

async function main(): Promise<void> {
  const [{ getDb }, { insertPlannedMission }, checkout, eligible] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/missions"),
    import("../src/lib/mission-checkout"),
    import("../src/lib/eligible-for-departure"),
  ]);
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO organizations (
       id,name,code,country,currency,timezone_offset,active,route_origin_lat,route_origin_lng
     ) VALUES (?, 'Test','T','LS','LSL',2,1,0,0)`
  ).run(ORG);
  insertVehicle(db, VEHICLE, "LS-MAK-1");
  insertVehicle(db, OTHER_VEHICLE, "LS-OTH-1");

  const missionId = insertPlannedMission(db, {
    organizationId: ORG,
    title: "MAK PVs Delivery",
    destination: "MAK",
    departureDate: TODAY,
    returnDate: "2026-08-29",
    missionType: "field",
    passengers: "",
    loadoutSummary: "",
    notes: "",
    createdById: "u",
    createdByName: "U",
    missionProfile: "field",
    requiredVehicleClass: "4wd",
  });
  db.prepare("UPDATE missions SET approval_status='approved', assigned_vehicle_id=? WHERE id=?").run(
    VEHICLE,
    missionId
  );

  // 1. Approved + reserved, no trip yet — the DVC picker must still list it.
  let listed = eligible.listEligibleDepartureTrips(db, {
    organizationId: ORG,
    vehicleId: VEHICLE,
    today: TODAY,
  });
  assert.equal(listed.trips.length, 1, "approved reserved mission with no trip should be listed");
  assert.equal(listed.trips[0].selection_kind, "mission");
  assert.equal(listed.trips[0].id, eligible.missionSelectionId(missionId));
  assert.equal(listed.trips[0].mission_title, "MAK PVs Delivery");
  assert.equal(listed.emptyHint, null);

  const otherListed = eligible.listEligibleDepartureTrips(db, {
    organizationId: ORG,
    vehicleId: OTHER_VEHICLE,
    today: TODAY,
  });
  assert.equal(otherListed.trips.length, 0, "other vehicle should not see this mission");
  assert.match(String(otherListed.emptyHint || ""), /MAK PVs Delivery/);
  assert.match(String(otherListed.emptyHint || ""), /LS-MAK-1/);

  const resolvedMission = eligible.resolveDepartingCheckAnchor(db, {
    organizationId: ORG,
    vehicleId: VEHICLE,
    selectionId: eligible.missionSelectionId(missionId),
    today: TODAY,
  });
  assert.equal(resolvedMission.ok, true);
  if (resolvedMission.ok) {
    assert.equal(resolvedMission.missionId, missionId);
    assert.equal(resolvedMission.tripId, null);
  }

  // 2. Trip created on the UNALLOCATED sentinel — picker keys off the reserved vehicle.
  const sentinel = checkout.ensureUnallocatedVehicle(db, ORG);
  insertTrip(db, "mak_trip", sentinel, missionId, "2026-08-27T07:00:00Z");
  db.prepare("UPDATE missions SET trip_id=? WHERE id=?").run("mak_trip", missionId);

  listed = eligible.listEligibleDepartureTrips(db, {
    organizationId: ORG,
    vehicleId: VEHICLE,
    today: TODAY,
  });
  assert.equal(listed.trips.length, 1, "unallocated planned trip should appear for the reserved vehicle");
  assert.equal(listed.trips[0].selection_kind, "trip");
  assert.equal(listed.trips[0].id, "mak_trip");
  const healed = db.prepare("SELECT vehicle_id FROM trips WHERE id=?").get("mak_trip") as {
    vehicle_id: string;
  };
  assert.equal(healed.vehicle_id, VEHICLE, "listing should sync the sentinel trip onto the reserved vehicle");

  const resolvedTrip = eligible.resolveDepartingCheckAnchor(db, {
    organizationId: ORG,
    vehicleId: VEHICLE,
    selectionId: "mak_trip",
    today: TODAY,
  });
  assert.equal(resolvedTrip.ok, true);
  if (resolvedTrip.ok) {
    assert.equal(resolvedTrip.tripId, "mak_trip");
    assert.equal(resolvedTrip.missionId, missionId);
  }

  // 3. Legacy assign path: mission.assigned_vehicle_id set, trip still on sentinel
  //    (simulate a second mission so we do not collide with mak_trip).
  const mission2 = insertPlannedMission(db, {
    organizationId: ORG,
    title: "MAK follow-up",
    destination: "MAK",
    departureDate: TODAY,
    returnDate: TODAY,
    missionType: "field",
    passengers: "",
    loadoutSummary: "",
    notes: "",
    createdById: "u",
    createdByName: "U",
    missionProfile: "field",
  });
  db.prepare("UPDATE missions SET approval_status='approved' WHERE id=?").run(mission2);
  insertTrip(db, "follow_trip", sentinel, mission2, "2026-08-27T08:00:00Z");
  db.prepare("UPDATE missions SET trip_id=? WHERE id=?").run("follow_trip", mission2);
  db.prepare("UPDATE missions SET assigned_vehicle_id=? WHERE id=?").run(OTHER_VEHICLE, mission2);
  checkout.syncAllocatedVehicleToPlannedTrip(db, mission2, OTHER_VEHICLE);
  const synced = db.prepare("SELECT vehicle_id FROM trips WHERE id=?").get("follow_trip") as {
    vehicle_id: string;
  };
  assert.equal(synced.vehicle_id, OTHER_VEHICLE);

  listed = eligible.listEligibleDepartureTrips(db, {
    organizationId: ORG,
    vehicleId: OTHER_VEHICLE,
    today: TODAY,
  });
  assert.ok(
    listed.trips.some((t) => t.id === "follow_trip"),
    "legacy assign sync should make the trip eligible for the allocated vehicle"
  );

  // 4. Pending (not approved) mission must not appear.
  const pendingId = insertPlannedMission(db, {
    organizationId: ORG,
    title: "Pending MAK",
    destination: "MAK",
    departureDate: TODAY,
    returnDate: TODAY,
    missionType: "field",
    passengers: "",
    loadoutSummary: "",
    notes: "",
    createdById: "u",
    createdByName: "U",
    missionProfile: "field",
  });
  db.prepare("UPDATE missions SET assigned_vehicle_id=? WHERE id=?").run(VEHICLE, pendingId);
  listed = eligible.listEligibleDepartureTrips(db, {
    organizationId: ORG,
    vehicleId: VEHICLE,
    today: TODAY,
  });
  assert.ok(!listed.trips.some((t) => t.mission_id === pendingId));

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("Eligible-for-departure DVC picker (approved mission / unallocated trip) OK.");
}

main().catch((error) => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
});
