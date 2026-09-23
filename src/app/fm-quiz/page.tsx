"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { useLocaleContext } from "@/i18n/locale-context";

type PublicQuestion = {
  id: string;
  prompt: string;
  choices: Array<{ id: string; label: string }>;
};

type QuizPayload = {
  version: string;
  passRatio: number;
  questions: PublicQuestion[];
  alreadyPassed: boolean;
  passedAt: string | null;
  score: number | null;
};

type GradePayload = {
  passed: boolean;
  score: number;
  correctCount: number;
  total: number;
  version: string;
  stamped?: boolean;
  operatorsUpdated?: number;
  message?: string;
  results?: Array<{
    questionId: string;
    selectedChoiceId: string | null;
    correctChoiceId: string;
    correct: boolean;
  }>;
};

export default function FmAppQuizPage(): React.ReactElement {
  const { user } = useAuth();
  const { locale } = useLocaleContext();
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grade, setGrade] = useState<GradePayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setGrade(null);
    try {
      const headers = await jsonHeadersWithBearer();
      const res = await fetch(`/api/me/fm-app-quiz?locale=${encodeURIComponent(locale)}`, {
        headers,
      });
      if (!res.ok) {
        setError("Could not load the quiz.");
        setQuiz(null);
        return;
      }
      const j = (await res.json()) as QuizPayload;
      setQuiz(j);
      setAnswers({});
    } catch {
      setError("Network error loading the quiz.");
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function submit(): Promise<void> {
    if (!quiz) return;
    setSubmitting(true);
    setError(null);
    try {
      const headers = await jsonHeadersWithBearer();
      const res = await fetch("/api/me/fm-app-quiz", {
        method: "POST",
        headers,
        body: JSON.stringify({ answers }),
      });
      const j = (await res.json()) as GradePayload & { error?: string };
      if (!res.ok && j.error) {
        setError(j.error);
        return;
      }
      setGrade(j);
      if (j.passed) {
        setQuiz((prev) =>
          prev
            ? {
                ...prev,
                alreadyPassed: true,
                passedAt: new Date().toISOString(),
                score: j.score,
              }
            : prev
        );
      }
    } catch {
      setError("Network error submitting the quiz.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-zinc-600">Sign in to take the Fleet Hub app-use quiz.</p>
      </div>
    );
  }

  const passPct = quiz ? Math.round(quiz.passRatio * 100) : 80;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">
          {locale === "fr" ? "Quiz d’utilisation Fleet Hub" : "Fleet Hub app-use quiz"}
        </h1>
        <p className="text-sm text-zinc-600 mt-1">
          {locale === "fr"
            ? `Obligatoire pour être désigné comme conducteur sur les demandes logistiques. Réussite à ${passPct} % ou plus. Vous pouvez repasser le quiz.`
            : `Required before you can be designated as a driver on logistics requests. Pass at ${passPct}% or higher. You may retake until you pass.`}
        </p>
      </div>

      {quiz?.alreadyPassed && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          {locale === "fr" ? "Quiz réussi" : "Quiz passed"}
          {quiz.passedAt ? ` · ${new Date(quiz.passedAt).toLocaleString()}` : ""}
          {quiz.score != null ? ` · ${Math.round(quiz.score * 100)}%` : ""}
        </div>
      )}

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && (
        <p className="text-sm text-red-700 rounded-lg border border-red-100 bg-red-50 px-3 py-2">{error}</p>
      )}

      {quiz && !loading && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex flex-wrap items-center gap-2">
              {locale === "fr" ? "Questions" : "Questions"}
              <Badge variant="secondary" className="text-[10px]">
                v{quiz.version}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {quiz.questions.map((q, idx) => {
              const result = grade?.results?.find((r) => r.questionId === q.id);
              return (
                <fieldset key={q.id} className="space-y-2">
                  <legend className="text-sm font-medium text-zinc-800">
                    {idx + 1}. {q.prompt}
                  </legend>
                  <div className="space-y-1.5">
                    {q.choices.map((c) => {
                      const selected = answers[q.id] === c.id;
                      let ring = "border-zinc-200";
                      if (result) {
                        if (c.id === result.correctChoiceId) ring = "border-emerald-400 bg-emerald-50";
                        else if (selected && !result.correct) ring = "border-red-300 bg-red-50";
                      } else if (selected) {
                        ring = "border-blue-400 bg-blue-50";
                      }
                      return (
                        <label
                          key={c.id}
                          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${ring}`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={c.id}
                            checked={selected}
                            disabled={!!grade?.passed}
                            onChange={() =>
                              setAnswers((prev) => ({ ...prev, [q.id]: c.id }))
                            }
                            className="mt-1"
                          />
                          <span>{c.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}

            {grade && (
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${
                  grade.passed
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-amber-200 bg-amber-50 text-amber-950"
                }`}
              >
                <strong>
                  {grade.correctCount}/{grade.total} ({Math.round(grade.score * 100)}%)
                </strong>
                {grade.message ? ` — ${grade.message}` : ""}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {!grade?.passed && (
                <Button
                  type="button"
                  disabled={
                    submitting ||
                    quiz.questions.some((q) => !answers[q.id])
                  }
                  onClick={() => void submit()}
                >
                  {submitting
                    ? locale === "fr"
                      ? "Envoi…"
                      : "Submitting…"
                    : locale === "fr"
                      ? "Soumettre"
                      : "Submit"}
                </Button>
              )}
              {grade && !grade.passed && (
                <Button type="button" variant="outline" onClick={() => void load()}>
                  {locale === "fr" ? "Repasser" : "Retake"}
                </Button>
              )}
              <Link href="/vehicle-requests" className="text-sm text-blue-700 underline self-center">
                {locale === "fr" ? "Retour aux Missions" : "Back to Missions"}
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
