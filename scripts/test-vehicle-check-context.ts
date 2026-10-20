/**
 * Driver Vehicle Check prefill context (mission/trip -> form defaults).
 *
 * Run with: npx tsx scripts/test-vehicle-check-context.ts
 *
 * Uses an isolated temp-file SQLite DB (DB_PATH must be set before importing src/lib/db).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-vehicle-check-context-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");

async function main(): Promise<void> {
  const { getDb } = await import("../src/lib/db");
  const { getVehicleCheckContext, parseDriverOverrideName } = await import("../src/lib/vehicle-check-context");
  const { ensureUnallocatedVehicle } = await import("../src/lib/mission-checkout");
  const db = getDb();

  for (const [id, code, cc] of [
    ["test_a", "T-A", "LS"],
    ["test_b", "T-B", "ZM"],
  ]) {
    db.prepare(
      `INSERT OR IGNORE INTO organizations (id, name, code, country, currency, timezone_offset, active)
       VALUES (?, ?, ?, ?, 'XXX', 2, 1)`
    ).run(id, `Test ${cc}`, code, cc);
  }
  const placeholder = ensureUnallocatedVehicle(db, "test_a");
  db.prepare("INSERT INTO vehicles (id, organization_id, code, make, model) VALUES ('veh1', 'test_a', 'LS-01', 'Toyota', 'Hilux')").run();

  // Override-name parsing
  assert.equal(parseDriverOverrideName("x\nDriver (override, not yet EHS-approved): Thabo M.\ny"), "Thabo M.");
  assert.equal(parseDriverOverrideName("nothing here"), null);
  assert.equal(parseDriverOverrideName(null), null);

  // Mission 1: assigned vehicle, trip on placeholder vehicle, no trip driver, override name on the request.
  db.prepare(
    `INSERT INTO missions (id, organization_id, title, destination, departure_location, departure_date, return_date, assigned_vehicle_id, trip_id)
     VALUES ('m1', 'test_a', 'Site visit', 'Mokhotlong', 'Maseru HQ', '2026-10-12', '2026-10-14', 'veh1', 't1')`
  ).run();
  db.prepare(
    `INSERT INTO trips (id, organization_id, vehicle_id, driver_name, odo_start, departure_location, destination, mission_id)
     VALUES ('t1', 'test_a', ?, '', 1000, '', '', 'm1')`
  ).run(placeholder);
  db.prepare(
    `INSERT INTO vehicle_requests (id, organization_id, mission_id, notes)
     VALUES ('vr1', 'test_a', 'm1', 'Need 4x4\nDriver (override, not yet EHS-approved): Palesa K.')`
  ).run();
  db.prepare(
    `INSERT INTO driver_vehicle_checks (id, organization_id, vehicle_id, mileage_km, created_at)
     VALUES ('c_old', 'test_a', 'veh1', 52000, '2026-09-01T08:00:00.000Z'),
            ('c_new', 'test_a', 'veh1', 52340, '2026-10-01T08:00:00.000Z')`
  ).run();

  const c1 = getVehicleCheckContext(db, { organizationId: "test_a", missionId: "m1" });
  assert.ok(c1);
  assert.equal(c1.missionId, "m1");
  assert.equal(c1.tripId, "t1");
  assert.equal(c1.title, "Site visit");
  assert.equal(c1.vehicleId, "veh1");
  assert.equal(c1.vehicleCode, "LS-01");
  assert.equal(c1.driverName, "Palesa K.");
  assert.equal(c1.routeFrom, "Maseru HQ"); // trip blank -> mission
  assert.equal(c1.routeTo, "Mokhotlong");
  assert.equal(c1.departureDate, "2026-10-12");
  assert.equal(c1.returnDate, "2026-10-14");
  assert.equal(c1.departed, false);
  assert.equal(c1.lastOdometerKm, 52340); // latest check beats trip odo_start

  // Same via trip id and via the picker's "mission:<id>" selection id.
  assert.equal(getVehicleCheckContext(db, { organizationId: "test_a", tripId: "t1" })?.missionId, "m1");
  assert.equal(getVehicleCheckContext(db, { organizationId: "test_a", tripId: "mission:m1" })?.tripId, "t1");

  // Org mismatch / unknown ids -> null
  assert.equal(getVehicleCheckContext(db, { organizationId: "test_b", missionId: "m1" }), null);
  assert.equal(getVehicleCheckContext(db, { organizationId: "test_b", tripId: "t1" }), null);
  assert.equal(getVehicleCheckContext(db, { organizationId: "test_a", missionId: "nope" }), null);
  assert.equal(getVehicleCheckContext(db, { organizationId: "test_a" }), null);

  // Mission 2: nothing allocated (placeholder only), trip driver + trip route win, designated operator not used.
  db.prepare(
    `INSERT INTO missions (id, organization_id, title, destination, departure_location, departure_date, return_date, trip_id)
     VALUES ('m2', 'test_a', 'Unallocated', 'Qacha', 'HQ', '2026-10-20', '2026-10-21', 't2')`
  ).run();
  db.prepare(
    `INSERT INTO trips (id, organization_id, vehicle_id, driver_name, odo_start, odo_end, departure_location, destination, mission_id, departed_at)
     VALUES ('t2', 'test_a', ?, 'Lerato N.', 100, 200, 'Teyateyaneng', 'Butha-Buthe', 'm2', '2026-10-20T06:00:00Z')`
  ).run(placeholder);
  const c2 = getVehicleCheckContext(db, { organizationId: "test_a", missionId: "m2" });
  assert.ok(c2);
  assert.equal(c2.vehicleId, null);
  assert.equal(c2.vehicleCode, null);
  assert.equal(c2.driverName, "Lerato N.");
  assert.equal(c2.routeFrom, "Teyateyaneng");
  assert.equal(c2.routeTo, "Butha-Buthe");
  assert.equal(c2.departed, true);
  assert.equal(c2.lastOdometerKm, 200); // trip odo_end over odo_start

  // Mission 3: designated operator display name is the last-resort driver; no odometer data -> null.
  db.prepare("INSERT INTO vehicles (id, organization_id, code, make, model) VALUES ('veh2', 'test_a', 'LS-02', 'Isuzu', 'D-Max')").run();
  db.prepare(
    `INSERT INTO ehs_approved_drivers (id, organization_id, email, display_name) VALUES ('op1', 'test_a', 'op@example.com', 'Mpho D.')`
  ).run();
  db.prepare(
    `INSERT INTO missions (id, organization_id, title, destination, departure_location, departure_date, return_date, assigned_vehicle_id)
     VALUES ('m3', 'test_a', 'No trip yet', 'Thaba-Tseka', 'HQ', '2026-10-25', '2026-10-26', 'veh2')`
  ).run();
  db.prepare(
    `INSERT INTO vehicle_requests (id, organization_id, mission_id, notes, designated_operator_id) VALUES ('vr3', 'test_a', 'm3', '', 'op1')`
  ).run();
  const c3 = getVehicleCheckContext(db, { organizationId: "test_a", missionId: "m3" });
  assert.ok(c3);
  assert.equal(c3.tripId, null);
  assert.equal(c3.vehicleId, "veh2");
  assert.equal(c3.driverName, "Mpho D.");
  assert.equal(c3.lastOdometerKm, null);
  assert.equal(c3.plannedFuelLiters, null);

  // Mission fuel budget is surfaced as info.
  db.prepare("UPDATE missions SET fuel_liters = 42.5 WHERE id = 'm1'").run();
  assert.equal(getVehicleCheckContext(db, { organizationId: "test_a", missionId: "m1" })?.plannedFuelLiters, 42.5);

  // ---- Vehicle-level prefill: last check (driver, fuel, defects) + odometer ----
  const { getVehiclePrefillContext, summarizeVehicleCheck } = await import("../src/lib/vehicle-check-context");

  db.prepare(
    `UPDATE driver_vehicle_checks
        SET driver_name = 'Driver One', direction = 'returning', check_date = '2026-10-01',
            drive_brakes = 'fail', fluids_fuel = 'fail', equip_jack = 0,
            failure_descriptions = ?, remarks = 'Squeal on braking'
      WHERE id = 'c_new'`
  ).run(JSON.stringify({ driveBrakes: "Soft pedal", fluids_fuel: "Below quarter" }));
  db.prepare("UPDATE driver_vehicle_checks SET drive_steering = 'fail' WHERE id = 'c_old'").run();

  const v1 = getVehiclePrefillContext(db, { organizationId: "test_a", vehicleId: "veh1" });
  assert.ok(v1);
  assert.equal(v1.vehicleCode, "LS-01");
  assert.equal(v1.lastOdometerKm, 52340);
  assert.equal(v1.lastOdometerSource, "check");
  assert.ok(v1.lastCheck);
  assert.equal(v1.lastCheck.id, "c_new"); // older check's defects are not carried
  assert.equal(v1.lastCheck.driverName, "Driver One");
  assert.equal(v1.lastCheck.direction, "returning");
  assert.equal(v1.lastCheck.fuel, "fail");
  assert.equal(v1.lastCheck.remarks, "Squeal on braking");
  assert.deepEqual(v1.lastCheck.defects, [
    { kind: "status", key: "fluidsFuel", description: "Below quarter" }, // snake-case description key still found
    { kind: "status", key: "driveBrakes", description: "Soft pedal" },
    { kind: "equipment", key: "equipJack", description: "" },
  ]);

  // Scope: other org, placeholder and unknown vehicles -> null.
  assert.equal(getVehiclePrefillContext(db, { organizationId: "test_b", vehicleId: "veh1" }), null);
  assert.equal(getVehiclePrefillContext(db, { organizationId: "test_a", vehicleId: placeholder }), null);
  assert.equal(getVehiclePrefillContext(db, { organizationId: "test_a", vehicleId: "nope" }), null);
  assert.equal(getVehiclePrefillContext(db, { organizationId: "", vehicleId: "veh1" }), null);

  // No check on record: lastCheck null; odometer comes from the trip log, then a higher in-trip reading.
  const v2empty = getVehiclePrefillContext(db, { organizationId: "test_a", vehicleId: "veh2" });
  assert.ok(v2empty);
  assert.equal(v2empty.lastCheck, null);
  assert.equal(v2empty.lastOdometerKm, null);
  assert.equal(v2empty.lastOdometerSource, null);
  db.prepare(
    `INSERT INTO trips (id, organization_id, vehicle_id, driver_name, odo_start, odo_end, departure_location, destination, checkout_at, checkin_at)
     VALUES ('t3', 'test_a', 'veh2', '', 8000, 8150, 'HQ', 'Site', '2026-10-02T06:00:00Z', '2026-10-02T18:00:00Z')`
  ).run();
  let v2 = getVehiclePrefillContext(db, { organizationId: "test_a", vehicleId: "veh2" });
  assert.equal(v2?.lastOdometerKm, 8150);
  assert.equal(v2?.lastOdometerSource, "trip");
  db.prepare(
    `INSERT INTO trip_odometer_readings (id, trip_id, organization_id, odo_km, recorded_at)
     VALUES ('r1', 't3', 'test_a', 8210, '2026-10-03T09:00:00Z')`
  ).run();
  v2 = getVehiclePrefillContext(db, { organizationId: "test_a", vehicleId: "veh2" });
  assert.equal(v2?.lastOdometerKm, 8210);
  assert.equal(v2?.lastOdometerSource, "trip_reading");
  assert.equal(v2?.lastOdometerAt, "2026-10-03T09:00:00Z");
  // Mission context uses the same vehicle-level odometer.
  assert.equal(getVehicleCheckContext(db, { organizationId: "test_a", missionId: "m3" })?.lastOdometerKm, 8210);

  // Seconded vehicle: visible to the borrower, and the owner's last check travels with it.
  db.prepare("UPDATE vehicles SET seconded_to_org = 'test_b' WHERE id = 'veh1'").run();
  const seconded = getVehiclePrefillContext(db, { organizationId: "test_b", vehicleId: "veh1" });
  assert.equal(seconded?.lastCheck?.id, "c_new");
  db.prepare("UPDATE vehicles SET seconded_to_org = NULL WHERE id = 'veh1'").run();

  // Summary of a clean row: no defects, fuel OK, blank fields -> null.
  const clean = summarizeVehicleCheck({ id: "x", fluids_fuel: "pass", mileage_km: 0, driver_name: "", equip_jack: 1 });
  assert.deepEqual(clean.defects, []);
  assert.equal(clean.fuel, "pass");
  assert.equal(clean.mileageKm, null);
  assert.equal(clean.driverName, null);
  assert.equal(clean.direction, "departing");
  // Malformed failure_descriptions JSON does not throw.
  assert.deepEqual(summarizeVehicleCheck({ id: "y", visual_doors: "fail", failure_descriptions: "{oops" }).defects, [
    { kind: "status", key: "visualDoors", description: "" },
  ]);

  console.log("vehicle check context tests passed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
