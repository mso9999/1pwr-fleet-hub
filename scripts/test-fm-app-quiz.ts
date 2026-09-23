#!/usr/bin/env tsx
/**
 * FM app quiz grading + compliance gate. Run: npx tsx scripts/test-fm-app-quiz.ts
 */

import assert from "node:assert/strict";
import {
  evaluateOperatorCompliance,
  type EhsDriverRow,
  type EhsOperatorAuthorization,
} from "../src/lib/ehs-approved-drivers";
import {
  FM_APP_QUIZ_PASS_RATIO,
  FM_APP_QUIZ_QUESTIONS,
  FM_APP_QUIZ_VERSION,
  getFmQuizPublicQuestions,
  gradeFmAppQuiz,
} from "../src/lib/fm-app-quiz";

const FIXED_NOW = new Date("2025-09-12T00:00:00Z");

function allCorrectAnswers(): Record<string, string> {
  return Object.fromEntries(FM_APP_QUIZ_QUESTIONS.map((q) => [q.id, q.correctChoiceId]));
}

function baseOperator(overrides: Partial<EhsDriverRow> = {}): EhsDriverRow {
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
    license_originally_issued: ymd(fiveYearsAgo),
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
    fm_app_quiz_passed_at: FIXED_NOW.toISOString(),
    fm_app_quiz_score: 1,
    fm_app_quiz_version: FM_APP_QUIZ_VERSION,
    ...overrides,
  };
}

function auth(): EhsOperatorAuthorization {
  return {
    id: "auth-onroad",
    operator_id: "op-1",
    category_code: "fleet_vehicle_onroad",
    grant: "approved",
    notes: "",
    created_at: FIXED_NOW.toISOString(),
    updated_at: FIXED_NOW.toISOString(),
  };
}

function testQuestionCount(): void {
  assert.ok(
    FM_APP_QUIZ_QUESTIONS.length >= 8 && FM_APP_QUIZ_QUESTIONS.length <= 12,
    `expected 8–12 questions, got ${FM_APP_QUIZ_QUESTIONS.length}`
  );
}

function testPublicQuestionsHideAnswers(): void {
  const pub = getFmQuizPublicQuestions("en");
  assert.equal(pub.length, FM_APP_QUIZ_QUESTIONS.length);
  for (const q of pub) {
    assert.ok(!("correctChoiceId" in q));
    assert.ok(q.prompt.length > 0);
    assert.ok(q.choices.length >= 2);
  }
  const fr = getFmQuizPublicQuestions("fr");
  assert.equal(fr.length, FM_APP_QUIZ_QUESTIONS.length);
  assert.notEqual(fr[0].prompt, pub[0].prompt);
}

function testGradePassAt80(): void {
  const answers = allCorrectAnswers();
  const total = FM_APP_QUIZ_QUESTIONS.length;
  const minCorrect = Math.ceil(total * FM_APP_QUIZ_PASS_RATIO);
  const needWrong = total - minCorrect + 1; // one below the pass threshold
  for (let i = 0; i < needWrong; i++) {
    const q = FM_APP_QUIZ_QUESTIONS[i];
    const wrong = q.choices.find((c) => c.id !== q.correctChoiceId);
    assert.ok(wrong);
    answers[q.id] = wrong!.id;
  }
  const fail = gradeFmAppQuiz(answers);
  assert.equal(fail.passed, false, `expected fail at score ${fail.score}`);
  assert.ok(fail.score < FM_APP_QUIZ_PASS_RATIO);

  const pass = gradeFmAppQuiz(allCorrectAnswers());
  assert.equal(pass.passed, true);
  assert.equal(pass.score, 1);
  assert.equal(pass.version, FM_APP_QUIZ_VERSION);
  assert.equal(pass.correctCount, FM_APP_QUIZ_QUESTIONS.length);
}

function testGradeBoundaryPass(): void {
  // Exactly 80% when length allows (10 questions → 8 correct).
  const total = FM_APP_QUIZ_QUESTIONS.length;
  const minCorrect = Math.ceil(total * FM_APP_QUIZ_PASS_RATIO);
  const answers = allCorrectAnswers();
  for (let i = minCorrect; i < total; i++) {
    const q = FM_APP_QUIZ_QUESTIONS[i];
    const wrong = q.choices.find((c) => c.id !== q.correctChoiceId)!;
    answers[q.id] = wrong.id;
  }
  const grade = gradeFmAppQuiz(answers);
  assert.equal(grade.correctCount, minCorrect);
  assert.ok(grade.score >= FM_APP_QUIZ_PASS_RATIO);
  assert.equal(grade.passed, true);
}

function testComplianceBlocksWithoutQuiz(): void {
  const row = baseOperator({
    fm_app_quiz_passed_at: null,
    fm_app_quiz_score: null,
    fm_app_quiz_version: "",
  });
  const result = evaluateOperatorCompliance({
    row,
    authorizations: [auth()],
    licenceMediaCount: 1,
    category: "fleet_vehicle_onroad",
    referenceNow: FIXED_NOW,
  });
  assert.equal(result.ready, false);
  assert.ok(
    result.reasons.some((r) => /app-use quiz/i.test(r)),
    `expected quiz reason, got: ${result.reasons.join(" / ")}`
  );
}

function testCompliancePassesWithQuiz(): void {
  const result = evaluateOperatorCompliance({
    row: baseOperator(),
    authorizations: [auth()],
    licenceMediaCount: 1,
    category: "fleet_vehicle_onroad",
    referenceNow: FIXED_NOW,
  });
  assert.equal(result.ready, true, result.reasons.join(" / "));
}

const tests: Array<[string, () => void]> = [
  ["question count 8–12", testQuestionCount],
  ["public payload hides answers (EN+FR)", testPublicQuestionsHideAnswers],
  ["grade fails below 80%", testGradePassAt80],
  ["grade passes at exactly 80%", testGradeBoundaryPass],
  ["compliance blocks without quiz stamp", testComplianceBlocksWithoutQuiz],
  ["compliance ready when quiz stamped", testCompliancePassesWithQuiz],
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
