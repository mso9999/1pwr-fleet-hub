import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GuideGettingStartedPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <div>
        <Link href="/guide" className="text-sm text-blue-600 hover:underline">
          ← User guide
        </Link>
        <h2 className="mt-3 text-2xl font-semibold text-zinc-900">Getting started</h2>
        <p className="mt-2 text-sm text-zinc-600">What you need to use Fleet Hub day to day.</p>
      </div>

      <Card className="border-zinc-200">
        <CardHeader>
          <CardTitle className="text-base">Sign in</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700 space-y-2">
          <p>
            Open Fleet Hub in the browser (e.g. <span className="font-mono text-xs">fm.1pwrafrica.com</span>). Use your 1PWR
            email and password. Your profile and permissions come from the same identity system as other 1PWR tools.
          </p>
          <p>If sign-in fails, confirm your account with IT and that this site is listed under authorized domains for login.</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200">
        <CardHeader>
          <CardTitle className="text-base">Organization</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700 space-y-2">
          <p>
            If you see an organization dropdown at the bottom of the sidebar, choose the entity you are working for (e.g.
            Lesotho, Zambia). Dashboard counts, vehicles, trips, and inspections are filtered to that organization.
          </p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200">
        <CardHeader>
          <CardTitle className="text-base">Main areas</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Dashboard</strong> — fleet snapshot and key numbers.
            </li>
            <li>
              <strong>Fleet Map</strong> — live or last-known positions where tracking is enabled.
            </li>
            <li>
              <strong>Vehicles</strong> — browse assets and open a vehicle for detail.
            </li>
            <li>
              <strong>Trips</strong> — check-out / check-in style trip logging.
            </li>
            <li>
              <strong>Work Orders</strong> — maintenance and repair tracking (including some items raised from failed
              inspections).
            </li>
            <li>
              <strong>Inspections</strong> — vehicle checklists; see the{" "}
              <Link href="/guide/inspections" className="text-blue-600 hover:underline">
                inspection walkthrough
              </Link>
              .
            </li>
            <li>
              <strong>Report Issue</strong> — quick field report when something is wrong on the road.
            </li>
            <li>
              <strong>Reports</strong> — exports such as CSV for analysis.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Link href="/guide" className="text-sm text-blue-600 hover:underline">
        ← All guide topics
      </Link>
    </div>
  );
}
