#!/usr/bin/env tsx
/**
 * Fleet performance maths. Run: npm run test:fleet-performance
 */
import assert from "node:assert/strict";
import {
  ageBracketLabel,
  buildFleetPerformance,
  chooseRepairAmount,
  isPrSpendStatus,
  keepMonotonic,
  mileageFromInspectionItems,
  odoBracketLabel,
  sampleStdDev,
  type VehicleRow,
} from "../src/lib/fleet-performance";

const drop = keepMonotonic([{ km: 100 }, { km: 90 }, { km: 110 }].map((p, i) => ({ ...p, i })));
assert.deepEqual(drop.map((p) => p.km), [100, 110]);

const longest = keepMonotonic([{ km: 100 }, { km: 50 }, { km: 60 }, { km: 70 }]);
assert.deepEqual(longest.map((p) => p.km), [50, 60, 70]);

assert.equal(sampleStdDev([10, 20, 30]), 10);
assert.equal(sampleStdDev([5]), null);

assert.equal(odoBracketLabel(50_000), "50k–100k");
assert.equal(odoBracketLabel(149_999), "100k–150k");
assert.equal(ageBracketLabel(7), "5–10 yrs");
assert.equal(ageBracketLabel(15), "15–20 yrs");

assert.equal(mileageFromInspectionItems('[{"category":"Odometer","item":"Mileage km","note":"337586"}]'), 337586);
assert.equal(mileageFromInspectionItems('[{"item":"Mileage (km): 125657","note":""}]'), 125657);
assert.equal(mileageFromInspectionItems('[{"item":"Tyres","note":"ok"}]'), null);

const workOrder = chooseRepairAmount(1800, 1800, 5000);
assert.equal(workOrder?.source, "work-order");
assert.equal(workOrder?.amount, 5000);
const prOnly = chooseRepairAmount(1800, 0, 0);
assert.equal(prOnly?.source, "pr");
assert.equal(prOnly?.amount, 1800);
const prBeatsThinWo = chooseRepairAmount(12_000, 0, 500);
assert.equal(prBeatsThinWo?.amount, 12_000);
assert.equal(prBeatsThinWo?.source, "pr");
const linesBeatHeader = chooseRepairAmount(0, 0, 100, 2_500);
assert.equal(linesBeatHeader?.amount, 2_500);
assert.equal(linesBeatHeader?.source, "work-order");

assert.equal(isPrSpendStatus("APPROVED"), true);
assert.equal(isPrSpendStatus("ordered"), true);
assert.equal(isPrSpendStatus("PENDING_APPROVAL"), false);
assert.equal(isPrSpendStatus("REJECTED"), false);

const vehicle = (id: string, year: number, price = 0): VehicleRow => ({
  id,
  code: id,
  country: "LS",
  currency: "LSL",
  year,
  purchasePrice: price,
  purchaseDate: price ? "2020-01-01" : null,
  status: "operational",
});

const perf = buildFleetPerformance({
  asOf: "2026-01-01",
  from: null,
  to: null,
  vehicles: [vehicle("J1", 2005, 100_000), vehicle("J2", 2016)],
  odo: [
    { vehicleId: "J1", date: "2024-01-01", km: 200_000 },
    { vehicleId: "J1", date: "2024-06-01", km: 190_000 },
    { vehicleId: "J1", date: "2025-01-01", km: 220_000 },
    { vehicleId: "J2", date: "2024-01-01", km: 80_000 },
    { vehicleId: "J2", date: "2025-01-01", km: 100_000 },
  ],
  repairs: [
    { vehicleId: "J1", date: "2024-06-01", amount: 10_000, source: "work-order" },
    { vehicleId: "J2", date: "2025-06-01", amount: 5_000, source: "pr" },
  ],
  downtime: [{ vehicleId: "J1", start: "2024-03-01", end: "2024-03-11" }],
});

assert.equal(perf.excludedNonMonotonic, 1);
assert.equal(perf.metrics.find((m) => m.id === "J1")?.latestOdo, 220_000);
assert.equal(perf.metrics.find((m) => m.id === "J1")?.purchasePrice, 100_000);
assert.equal(perf.metrics.find((m) => m.id === "J1")?.tco, 110_000);
assert.equal(perf.metrics.find((m) => m.id === "J2")?.repairSpend, 5_000);
assert.equal(perf.odoBrackets.some((bar) => bar.label === "200k–250k"), true);
assert.ok((perf.metrics.find((m) => m.id === "J1")?.kmPerYear ?? 0) > 0);
assert.equal(perf.portfolio.ratedVehicles, 2);
assert.ok((perf.portfolio.stdevTcoPerKmYear ?? 0) > 0);
assert.equal(perf.metrics.find((m) => m.id === "J1")?.downtimeDays, 10);
assert.ok(perf.months[perf.months.length - 1].spend >= 115_000);

const ranged = buildFleetPerformance({
  asOf: "2026-01-01",
  from: "2025-01-01",
  to: "2025-12-31",
  vehicles: [vehicle("J1", 2005, 100_000)],
  odo: [
    { vehicleId: "J1", date: "2024-01-01", km: 200_000 },
    { vehicleId: "J1", date: "2025-06-01", km: 210_000 },
  ],
  repairs: [{ vehicleId: "J1", date: "2024-06-01", amount: 9_000, source: "work-order" }],
  downtime: [],
});
assert.equal(ranged.metrics[0].purchasePrice, 0);
assert.equal(ranged.metrics[0].repairSpend, 0);
assert.equal(ranged.metrics[0].latestOdo, 210_000);

console.log("fleet performance: all tests passed.");
