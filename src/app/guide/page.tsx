import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TutorialLaunchButton } from "@/components/tutorial/TutorialLaunchButton";

const SECTIONS = [
  {
    href: "/guide/inspections",
    title: "Vehicle inspection checklists",
    description:
      "Step-by-step: choose checklist type, complete line items, submit, and manage saved inspections. Best for drivers and mechanics before trips or after service.",
  },
  {
    href: "/guide/getting-started",
    title: "Getting started",
    description: "Sign-in, organization, and how the main areas of Fleet Hub fit together.",
  },
  {
    href: "/guide/daily-workflows",
    title: "Common daily workflows",
    description: "Trips, reporting a field issue, work orders, daily update text, and reports/exports.",
  },
] as const;

export default function GuideIndexPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-900">User guide</h2>
        <p className="mt-2 text-sm text-zinc-600">
          In-app help for 1PWR Fleet Hub. Open a topic below; each page is written to match what you see on screen.
        </p>
      </div>

      <Card className="border-blue-200 bg-blue-50/40">
        <CardHeader>
          <CardTitle className="text-lg text-blue-900">Interactive tutorial</CardTitle>
          <CardDescription className="text-zinc-700">
            Step through the main workflows with on-screen highlights: dashboard, vehicles, trips, checks, work orders, map,
            analytics, reports, and daily update. A temporary demo vehicle (code starting with{" "}
            <span className="font-mono">TUT-</span>) is created for the register walkthrough and removed when you finish or exit.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <TutorialLaunchButton className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700" />
          <span className="text-xs text-zinc-500">Or open the app with</span>
          <Link href="/?tutorial=1" className="font-mono text-xs text-blue-700 hover:underline">
            ?tutorial=1
          </Link>
        </CardContent>
      </Card>

      <ul className="space-y-4">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="block rounded-xl transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
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
          <CardTitle className="text-base">Tip</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600 space-y-2">
          <p>
            Bookmark this page on your phone or tablet. Inspections are designed for touch: large buttons for{" "}
            <strong>Pass</strong>, <strong>Warn</strong>, and <strong>Fail</strong> on each line.
          </p>
          <p>
            Production URL: <span className="font-mono text-xs">fm.1pwrafrica.com</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
