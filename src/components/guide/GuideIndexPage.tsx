"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TutorialLaunchButton } from "@/components/tutorial/TutorialLaunchButton";
import { useLocaleContext } from "@/i18n/locale-context";
import { getGuideContent } from "@/content/guide";
import { GuideParagraph } from "./GuideSegments";

export function GuideIndexPageClient(): React.ReactElement {
  const { locale } = useLocaleContext();
  const g = getGuideContent(locale).index;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-900">{g.title}</h2>
        <p className="mt-2 text-sm text-zinc-600">{g.intro}</p>
      </div>

      <Card className="border-blue-200 bg-blue-50/40">
        <CardHeader>
          <CardTitle className="text-lg text-blue-900">{g.tutorialTitle}</CardTitle>
          <CardDescription className="text-zinc-700 space-y-2">
            {g.tutorialBody.map((para, i) => (
              <GuideParagraph key={i} segments={para} />
            ))}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <TutorialLaunchButton className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700" />
          <span className="text-xs text-zinc-500">{g.tutorialOr}</span>
          <Link href="/?tutorial=1" className="font-mono text-xs text-blue-700 hover:underline">
            {g.tutorialQuery}
          </Link>
        </CardContent>
      </Card>

      <ul className="space-y-4">
        {g.sections.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block rounded-xl transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Card className="h-full border-zinc-200 hover:border-blue-200">
                <CardHeader>
                  <CardTitle className="text-lg text-blue-700">{s.title}</CardTitle>
                  <CardDescription className="text-zinc-600">{s.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <Card className="border-dashed border-zinc-300 bg-zinc-50/80">
        <CardHeader>
          <CardTitle className="text-base">{g.tipTitle}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600 space-y-2">
          {g.tipParagraphs.map((para, i) => (
            <GuideParagraph key={i} segments={para} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
