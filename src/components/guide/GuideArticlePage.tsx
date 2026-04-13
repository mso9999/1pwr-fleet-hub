"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocaleContext } from "@/i18n/locale-context";
import { getGuideContent } from "@/content/guide";
import type { GuideArticle, GuideContent } from "@/content/guide/types";
import { GuideParagraph } from "./GuideSegments";
import { cn } from "@/lib/utils";

export type GuideArticleKey = Exclude<keyof GuideContent, "index">;

export function GuideArticlePage({ articleKey }: { articleKey: GuideArticleKey }): React.ReactElement {
  const { locale, t } = useLocaleContext();
  const content = getGuideContent(locale);
  const article = content[articleKey] as GuideArticle;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <div>
        <Link href="/guide" className="text-sm text-blue-600 hover:underline">
          {t("guide.backToIndex")}
        </Link>
        <h2 className="mt-3 text-2xl font-semibold text-zinc-900">{article.title}</h2>
        <p className="mt-2 text-sm text-zinc-600">{article.subtitle}</p>
      </div>

      <nav aria-label={t("guide.onThisPage")} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("guide.onThisPage")}</div>
        <ol className="mt-2 space-y-1.5 text-sm">
          {article.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-blue-700 hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-6">
        {article.sections.map((section) => (
          <Card key={section.id} id={section.id} className="scroll-mt-24 border-zinc-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.paragraphs?.map((para, pi) => (
                <GuideParagraph key={pi} segments={para} />
              ))}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-700">
                  {section.bullets.map((b, bi) => (
                    <li key={bi}>{b}</li>
                  ))}
                </ul>
              )}
              {section.callout && (
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    section.callout.variant === "warning" &&
                      "border-amber-200 bg-amber-50 text-amber-950",
                    section.callout.variant === "info" &&
                      "border-slate-200 bg-slate-50 text-slate-900",
                    section.callout.variant === "success" &&
                      "border-emerald-200 bg-emerald-50 text-emerald-950"
                  )}
                >
                  {section.callout.paragraphs.map((para, ci) => (
                    <GuideParagraph key={ci} segments={para} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {articleKey === "inspections" && (
          <Link
            href="/inspections"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t("guide.goToInspections")}
          </Link>
        )}
        <Link
          href="/guide"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          {t("guide.allTopics")}
        </Link>
      </div>
    </div>
  );
}
