import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import {
  FM_APP_QUIZ_PASS_RATIO,
  FM_APP_QUIZ_VERSION,
  getFmQuizPublicQuestions,
  gradeFmAppQuiz,
  type FmQuizLocale,
} from "@/lib/fm-app-quiz";
import { getFmAppQuizPassByEmail, stampFmAppQuizPass } from "@/lib/fm-app-quiz-store";

/**
 * GET /api/me/fm-app-quiz?locale=en|fr
 * Public questions (no answers) + current pass status for the signed-in user.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const localeRaw = (request.nextUrl.searchParams.get("locale") || "en").toLowerCase();
  const locale: FmQuizLocale = localeRaw === "fr" ? "fr" : "en";
  const db = getDb();
  const existing = getFmAppQuizPassByEmail(db, user.email || "");

  return NextResponse.json({
    version: FM_APP_QUIZ_VERSION,
    passRatio: FM_APP_QUIZ_PASS_RATIO,
    questions: getFmQuizPublicQuestions(locale),
    alreadyPassed: !!existing,
    passedAt: existing?.passed_at ?? null,
    score: existing?.score ?? null,
  });
}

/**
 * POST /api/me/fm-app-quiz
 * Body: { answers: Record<questionId, choiceId>, locale?: "en"|"fr" }
 * Grades the quiz; on pass, stamps fm_app_quiz_passes + matching EHS operator rows.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    answers?: Record<string, string>;
  };
  const answers =
    body.answers && typeof body.answers === "object" ? body.answers : {};

  const grade = gradeFmAppQuiz(answers);
  if (!grade.passed) {
    return NextResponse.json({
      ...grade,
      stamped: false,
      operatorsUpdated: 0,
      message: `Score ${(grade.score * 100).toFixed(0)}% — need ${Math.round(FM_APP_QUIZ_PASS_RATIO * 100)}% to pass. Retake when ready.`,
    });
  }

  const db = getDb();
  const { operatorsUpdated } = stampFmAppQuizPass(db, {
    email: user.email || "",
    userId: user.id,
    score: grade.score,
    version: grade.version,
  });

  return NextResponse.json({
    ...grade,
    stamped: true,
    operatorsUpdated,
    message:
      operatorsUpdated > 0
        ? "Passed. Your EHS operator record(s) are updated — you can be designated as a driver."
        : "Passed and saved. Ask EHS to add you to the approved drivers register if you are not listed yet; the pass will attach to your row.",
  });
}
