import type Database from "better-sqlite3";
import { recordMutation } from "@/lib/record-mutation-log";
import { normalizeEmail } from "@/lib/vehicle-check-approvers";
import type { EhsDriverRow } from "@/lib/ehs-approved-drivers";

export interface WrittenOffroadPassInput {
  email: string;
  organizationId: string;
  attemptId: string;
  passedAt: string;
  score: number;
}

export type WrittenOffroadPassResult =
  | { ok: true; found: false }
  | {
      ok: true;
      found: true;
      alreadyPassed: boolean;
      operatorId: string;
      writtenOffroadResult: string;
      writtenTestPassedAt: string;
    };

/**
 * Record a passing EHS written off-road test on a D018 operator.
 * Does not create operators and does not clear attestation.
 */
export function applyWrittenOffroadPass(
  db: Database.Database,
  input: WrittenOffroadPassInput
): WrittenOffroadPassResult {
  const email = normalizeEmail(input.email);
  const org = (input.organizationId || "1pwr_lesotho").trim() || "1pwr_lesotho";
  const row = db
    .prepare(
      `SELECT * FROM ehs_approved_drivers WHERE organization_id = ? AND lower(trim(email)) = ?`
    )
    .get(org, email) as EhsDriverRow | undefined;

  if (!row) return { ok: true, found: false };

  if (row.written_offroad_result === "pass") {
    return {
      ok: true,
      found: true,
      alreadyPassed: true,
      operatorId: row.id,
      writtenOffroadResult: row.written_offroad_result,
      writtenTestPassedAt: row.written_test_passed_at,
    };
  }

  const passedAt = input.passedAt || new Date().toISOString();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE ehs_approved_drivers
        SET written_offroad_result = 'pass',
            written_test_passed_at = ?,
            updated_at = ?,
            updated_by_id = 'ehs-app',
            updated_by_name = 'EHS App'
      WHERE id = ?`
  ).run(passedAt, now, row.id);

  const after = db
    .prepare("SELECT * FROM ehs_approved_drivers WHERE id = ?")
    .get(row.id) as EhsDriverRow;

  recordMutation(db, {
    entityType: "ehs_approved_driver",
    entityId: row.id,
    organizationId: org,
    action: "update",
    actor: {
      id: "ehs-app",
      name: "EHS App",
      role: "integration",
      department: "EHS",
    },
    before: {
      written_offroad_result: row.written_offroad_result,
      written_test_passed_at: row.written_test_passed_at,
      attested_at: row.attested_at,
    },
    after: {
      written_offroad_result: after.written_offroad_result,
      written_test_passed_at: after.written_test_passed_at,
      attested_at: after.attested_at,
    },
    reason: `ehs written-offroad attempt ${input.attemptId} score=${input.score}`,
  });

  return {
    ok: true,
    found: true,
    alreadyPassed: false,
    operatorId: after.id,
    writtenOffroadResult: after.written_offroad_result,
    writtenTestPassedAt: after.written_test_passed_at,
  };
}
