import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { listDeploymentsForEmployee } from "../src/lib/deployments";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE vehicles (
    id TEXT PRIMARY KEY,
    code TEXT,
    make TEXT,
    model TEXT,
    license_plate TEXT
  );
  CREATE TABLE trips (
    id TEXT PRIMARY KEY,
    departed_at TEXT,
    checkin_at TEXT,
    checkout_at TEXT,
    destination TEXT,
    departure_location TEXT
  );
  CREATE TABLE ehs_approved_drivers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    hr_employee_id TEXT NOT NULL
  );
  CREATE TABLE driver_vehicle_checks (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    trip_id TEXT,
    driver_id TEXT NOT NULL DEFAULT '',
    driver_hr_employee_id TEXT NOT NULL DEFAULT '',
    check_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    passenger_manifest TEXT NOT NULL DEFAULT '[]',
    overall_pass INTEGER NOT NULL DEFAULT 1,
    direction TEXT NOT NULL DEFAULT 'departing'
  );
`);

db.prepare("INSERT INTO vehicles VALUES (?, ?, ?, ?, ?)").run(
  "vehicle-1", "LS-01", "Toyota", "Hilux", "A123"
);
db.prepare("INSERT INTO trips VALUES (?, ?, ?, ?, ?, ?)").run(
  "trip-1",
  "2026-07-06T06:00:00Z",
  "2026-07-10T18:00:00Z",
  "2026-07-06T05:50:00Z",
  "Field site",
  "HQ"
);
db.prepare("INSERT INTO ehs_approved_drivers VALUES (?, ?, ?)").run(
  "operator-1", "1pwr_lesotho", "1PWR77"
);
db.prepare(`
  INSERT INTO driver_vehicle_checks (
    id, organization_id, vehicle_id, trip_id, driver_id,
    driver_hr_employee_id, check_date, created_at, passenger_manifest
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "inspection-driver",
  "1pwr_lesotho",
  "vehicle-1",
  "trip-1",
  "operator-1",
  "",
  "2026-07-06",
  "2026-07-06T05:45:00Z",
  "[]"
);

const historicalDriver = listDeploymentsForEmployee(db, {
  employeeId: "1PWR77",
  limit: 1,
});
assert.equal(historicalDriver.length, 1, "driver must not need to be duplicated as a passenger");
assert.equal(historicalDriver[0].inspection_id, "inspection-driver");
assert.equal(historicalDriver[0].status, "completed");

// New checks snapshot the HR employee ID. The deployment must remain linked
// even if the EHS operator register entry is later removed or replaced.
db.prepare("UPDATE driver_vehicle_checks SET driver_hr_employee_id = ? WHERE id = ?").run(
  "1PWR77", "inspection-driver"
);
db.prepare("DELETE FROM ehs_approved_drivers WHERE id = ?").run("operator-1");
const durableDriver = listDeploymentsForEmployee(db, {
  employeeId: "1PWR77",
  limit: 1,
});
assert.equal(durableDriver.length, 1);
assert.equal(durableDriver[0].inspection_id, "inspection-driver");

db.prepare(`
  INSERT INTO driver_vehicle_checks (
    id, organization_id, vehicle_id, trip_id, driver_id,
    driver_hr_employee_id, check_date, created_at, passenger_manifest
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "inspection-passenger",
  "1pwr_lesotho",
  "vehicle-1",
  "trip-1",
  "",
  "",
  "2026-07-07",
  "2026-07-07T05:45:00Z",
  JSON.stringify([{ employee_id: "1PWR88", name: "Passenger" }])
);
const passenger = listDeploymentsForEmployee(db, {
  employeeId: "1PWR88",
  limit: 1,
});
assert.equal(passenger.length, 1, "passenger-manifest matching must remain supported");
assert.equal(passenger[0].inspection_id, "inspection-passenger");

db.close();
console.log("deployment employee matching: ok");
