/**
 * Persist FM app quiz pass by email and sync onto ehs_approved_drivers rows.
 */

import type { Database } from "better-sqlite3";
import { normalizeEmail } from "@/lib/vehicle-check-approvers";
import { FM_APP_QUIZ_VERSION } from "@/lib/fm-app-quiz";

export function stampFmAppQuizPass(
  db: Database,
  input: {
    email: string;
    userId?: string;
    score: number;
    version?: string;
    passedAt?: string;
  }
): { operatorsUpdated: number } {
  const email = normalizeEmail(input.email);
  if (!email) return { operatorsUpdated: 0 };
  const passedAt = input.passedAt || new Date().toISOString();
  const version = input.version || FM_APP_QUIZ_VERSION;
  const userId = String(input.userId || "");

  db.prepare(
    `INSERT INTO fm_app_quiz_passes (email, passed_at, score, version, user_id, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET
       passed_at = excluded.passed_at,
       score = excluded.score,
       version = excluded.version,
       user_id = CASE WHEN excluded.user_id != '' THEN excluded.user_id ELSE fm_app_quiz_passes.user_id END,
       updated_at = datetime('now')`
  ).run(email, passedAt, input.score, version, userId);

  const result = db
    .prepare(
      `UPDATE ehs_approved_drivers
       SET fm_app_quiz_passed_at = ?,
           fm_app_quiz_score = ?,
           fm_app_quiz_version = ?
       WHERE lower(trim(email)) = ?`
    )
    .run(passedAt, input.score, version, email);

  return { operatorsUpdated: Number(result.changes || 0) };
}

/** Copy ledger pass onto an operator row if the email already passed. */
export function syncFmAppQuizPassOntoOperator(
  db: Database,
  operatorId: string,
  email: string
): boolean {
  const n = normalizeEmail(email);
  if (!n || !operatorId) return false;
  const pass = db
    .prepare(`SELECT passed_at, score, version FROM fm_app_quiz_passes WHERE email = ?`)
    .get(n) as { passed_at: string; score: number; version: string } | undefined;
  if (!pass?.passed_at) return false;
  db.prepare(
    `UPDATE ehs_approved_drivers
     SET fm_app_quiz_passed_at = ?,
         fm_app_quiz_score = ?,
         fm_app_quiz_version = ?
     WHERE id = ?`
  ).run(pass.passed_at, pass.score, pass.version || FM_APP_QUIZ_VERSION, operatorId);
  return true;
}

export function getFmAppQuizPassByEmail(
  db: Database,
  email: string
): { passed_at: string; score: number; version: string } | null {
  const n = normalizeEmail(email);
  if (!n) return null;
  const row = db
    .prepare(`SELECT passed_at, score, version FROM fm_app_quiz_passes WHERE email = ?`)
    .get(n) as { passed_at: string; score: number; version: string } | undefined;
  return row?.passed_at ? row : null;
}
