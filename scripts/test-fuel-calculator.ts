#!/usr/bin/env tsx
/**
 * Fuel calculator Excel parity + road fallback. Run: npx tsx scripts/test-fuel-calculator.ts
 */
import assert from "node:assert/strict";
import {
  calculateFuelBudget,
  kmPerLToLPer100,
  lPer100ToKmPerL,
  ROAD_FALLBACK_FACTOR,
} from "../src/lib/fuel-calculator";
import { estimatedRoadKm, haversineKm, buildTripWaypoints } from "../src/lib/route-distance";

function testExcelWorkedExample(): void {
  const r = calculateFuelBudget({
    distanceKm: 100,
    kmPerLitre: 10,
    pumpPricePerLitre: 20,
    safetyFactor: 2,
  });
  assert.equal(r.litres, 10);
  assert.equal(r.cost, 200);
  assert.equal(r.budget, 400);
}

function testEconomyConversion(): void {
  assert.equal(lPer100ToKmPerL(10), 10);
  assert.equal(kmPerLToLPer100(10), 10);
  const r = calculateFuelBudget({
    distanceKm: 100,
    kmPerLitre: lPer100ToKmPerL(10),
    pumpPricePerLitre: 20,
    safetyFactor: 2,
  });
  assert.equal(r.budget, 400);
}

function testRoadFallbackSeparateFromSafety(): void {
  const a = { lat: 0, lng: 0 };
  const b = { lat: 0, lng: 1 }; // ~111.2 km
  const straight = haversineKm(a, b);
  const estimated = estimatedRoadKm(a, b);
  assert.ok(Math.abs(estimated - straight * ROAD_FALLBACK_FACTOR) < 0.2);
  // Safety factor must not appear in distance
  const budget = calculateFuelBudget({
    distanceKm: estimated,
    kmPerLitre: 10,
    pumpPricePerLitre: 1,
    safetyFactor: 2,
  });
  assert.equal(budget.litres, Math.round((estimated / 10) * 100) / 100);
  assert.equal(budget.budget, Math.round(budget.cost * 2 * 100) / 100);
}

function testRoundTripAppendsReturn(): void {
  const pts = [
    { lat: -29.3, lng: 27.5 },
    { lat: -29.2, lng: 27.6 },
  ];
  const round = buildTripWaypoints(pts, "round_trip");
  assert.equal(round.length, 3);
  assert.equal(round[0].lat, round[2].lat);
  const oneWay = buildTripWaypoints(pts, "one_way");
  assert.equal(oneWay.length, 2);
}

const tests: Array<[string, () => void]> = [
  ["Excel worked example 100/10/20/2 → budget 400", testExcelWorkedExample],
  ["L/100 km ↔ km/L conversion", testEconomyConversion],
  ["1.4 road fallback ≠ money safety factor", testRoadFallbackSeparateFromSafety],
  ["round trip appends return leg", testRoundTripAppendsReturn],
];

let failures = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL  ${name}`);
    console.error(String(e));
  }
}
if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} tests passed.`);
