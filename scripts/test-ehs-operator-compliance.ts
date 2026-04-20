#!/usr/bin/env tsx
/**
 * Minimal unit tests for evaluateOperatorCompliance covering each D018 category's
 * requirement matrix. Run: `tsx scripts/test-ehs-operator-compliance.ts`
 */

import assert from "node:assert/strict";
import {
  evaluateOperatorCompliance,
  type EhsDriverRow,
  type EhsOperatorAuthorization,
} from "../src/lib/ehs-approved-drivers";
import {
  OPERATOR_CATEGORIES,
  type OperatorCategoryCode,
  type OperatorGrant,
} from "../src/lib/ehs-operator-categories";

const FIXED_NOW = new Date("2025-09-12T00:00:00Z");

function baseOperator(): EhsDriverRow {
  // Valid-from five years ago so the two-year continuity rule passes.
  const fiveYearsAgo = new Date(FIXED_NOW);
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const oneYearAhead = new Date(FIXED_NOW);
  oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);
  const ymd = (d: Date): string => d.toISOString().slice(0, 10);
  return {
    id: "op-1",
    organization_id: "1pwr_lesotho",
    hr_user_id: null,
    hr_employee_id: "1PWR-T",
    email: "test@1pwr.com",
    display_name: "Test Operator",
    license_valid_from: ymd(fiveYearsAgo),
    license_expiry: ymd(oneYearAhead),
    written_test_passed_at: "",
    road_test_passed_at: "",
    eye_test_passed_at: "",
    reaction_test_passed_at: "",
    vision_result: "pass",
    hearing_result: "pass",
    reaction_result: "pass",
    written_offroad_result: "pass",
    practical_result: "pass",
    status: "active",
    notes: "",
    created_at: FIXED_NOW.toISOString(),
    updated_at: FIXED_NOW.toISOString(),
    updated_by_id: "",
    updated_by_name: "",
    attested_by_id: "admin",
    attested_by_name: "Admin",
    attested_at: FIXED_NOW.toISOString(),
  };
}

function auth(
  category: OperatorCategoryCode,
  grant: OperatorGrant
): EhsOperatorAuthorization {
  return {
    id: `auth-${category}-${grant}`,
    operator_id: "op-1",
    category_code: category,
    grant,
    notes: "",
    created_at: FIXED_NOW.toISOString(),
    updated_at: FIXED_NOW.toISOString(),
  };
}

function testHappyPaths(): void {
  for (const meta of OPERATOR_CATEGORIES) {
    const row = baseOperator();
    const authorizations = [auth(meta.code, "approved")];
    const licenceMediaCount = meta.licenceRequired ? 1 : 0;
    const trainingCount = meta.trainingRecordRequired
      ? { [`auth-${meta.code}-approved`]: 1 }
      : undefined;

    const result = evaluateOperatorCompliance({
      row,
      authorizations,
      licenceMediaCount,
      trainingMediaCountByAuthId: trainingCount,
      category: meta.code,
      referenceNow: FIXED_NOW,
    });
    assert.equal(result.ready, true, `Happy path failed for category ${meta.code}: ${result.reasons.join(" / ")}`);
  }
}

function testGrantNoneBlocks(): void {
  const row = baseOperator();
  const result = evaluateOperatorCompliance({
    row,
    authorizations: [auth("fleet_vehicle_onroad", "none")],
    licenceMediaCount: 1,
    category: "fleet_vehicle_onroad",
    referenceNow: FIXED_NOW,
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((r) => r.includes("No authorization")));
}

function testAttestationStalenessBlocks(): void {
  const row = baseOperator();
  row.attested_at = null;
  const result = evaluateOperatorCompliance({
    row,
    authorizations: [auth("fleet_vehicle_onroad", "approved")],
    licenceMediaCount: 1,
    category: "fleet_vehicle_onroad",
    referenceNow: FIXED_NOW,
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((r) => r.toLowerCase().includes("attested")));
}

function testMissingLicenceBlocksOnRoad(): void {
  const row = baseOperator();
  const result = evaluateOperatorCompliance({
    row,
    authorizations: [auth("fleet_vehicle_onroad", "approved")],
    licenceMediaCount: 0,
    category: "fleet_vehicle_onroad",
    referenceNow: FIXED_NOW,
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((r) => r.toLowerCase().includes("licence")));
}

function testMissingTrainingRecordBlocksPlant(): void {
  const row = baseOperator();
  const result = evaluateOperatorCompliance({
    row,
    authorizations: [auth("telehandler", "approved")],
    licenceMediaCount: 0,
    trainingMediaCountByAuthId: {},
    category: "telehandler",
    referenceNow: FIXED_NOW,
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((r) => r.toLowerCase().includes("training record")));
}

function testWrittenRequiredForOffroad(): void {
  const row = baseOperator();
  row.written_offroad_result = "pending";
  const result = evaluateOperatorCompliance({
    row,
    authorizations: [auth("offroad_vehicle", "approved")],
    licenceMediaCount: 0,
    trainingMediaCountByAuthId: { "auth-offroad_vehicle-approved": 1 },
    category: "offroad_vehicle",
    referenceNow: FIXED_NOW,
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((r) => r.toLowerCase().includes("written")));
}

function testWrittenNotRequiredForOnRoadLight(): void {
  const row = baseOperator();
  row.written_offroad_result = "pending";
  const result = evaluateOperatorCompliance({
    row,
    authorizations: [auth("fleet_vehicle_onroad", "approved")],
    licenceMediaCount: 1,
    category: "fleet_vehicle_onroad",
    referenceNow: FIXED_NOW,
  });
  assert.equal(result.ready, true, `On-road should not need written; reasons: ${result.reasons.join(" / ")}`);
}

function testSuspendedBlocks(): void {
  const row = baseOperator();
  row.status = "suspended";
  const result = evaluateOperatorCompliance({
    row,
    authorizations: [auth("fleet_vehicle_onroad", "approved")],
    licenceMediaCount: 1,
    category: "fleet_vehicle_onroad",
    referenceNow: FIXED_NOW,
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.some((r) => r.toLowerCase().includes("status")));
}

function testStaleAttestationAfterEditBlocks(): void {
  const row = baseOperator();
  const later = new Date(FIXED_NOW);
  later.setDate(later.getDate() + 1);
  row.updated_at = later.toISOString();
  const result = evaluateOperatorCompliance({
    row,
    authorizations: [auth("fleet_vehicle_onroad", "approved")],
    licenceMediaCount: 1,
    category: "fleet_vehicle_onroad",
    referenceNow: FIXED_NOW,
  });
  assert.equal(result.ready, false, `Expected stale attestation to block; reasons: ${result.reasons.join(" / ")}`);
  assert.ok(result.reasons.some((r) => r.toLowerCase().includes("attested")));
}

function testTrainerGrantReady(): void {
  const row = baseOperator();
  const result = evaluateOperatorCompliance({
    row,
    authorizations: [auth("fleet_vehicle_onroad_heavy", "trainer")],
    licenceMediaCount: 1,
    trainingMediaCountByAuthId: { "auth-fleet_vehicle_onroad_heavy-trainer": 1 },
    category: "fleet_vehicle_onroad_heavy",
    referenceNow: FIXED_NOW,
  });
  assert.equal(result.ready, true, `Trainer should count as ready; reasons: ${result.reasons.join(" / ")}`);
  assert.equal(result.grant, "trainer");
}

const tests: Array<[string, () => void]> = [
  ["happy paths for every category", testHappyPaths],
  ["grant=none blocks readiness", testGrantNoneBlocks],
  ["missing attestation blocks", testAttestationStalenessBlocks],
  ["missing licence blocks on-road", testMissingLicenceBlocksOnRoad],
  ["missing training record blocks plant", testMissingTrainingRecordBlocksPlant],
  ["written test required for off-road", testWrittenRequiredForOffroad],
  ["written test not required for on-road light", testWrittenNotRequiredForOnRoadLight],
  ["suspended status blocks", testSuspendedBlocks],
  ["stale attestation after edit blocks", testStaleAttestationAfterEditBlocks],
  ["trainer grant counts as ready", testTrainerGrantReady],
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
