import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GuideDailyWorkflowsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <div>
        <Link href="/guide" className="text-sm text-blue-600 hover:underline">
          ← User guide
        </Link>
        <h2 className="mt-3 text-2xl font-semibold text-zinc-900">Common daily workflows</h2>
        <p className="mt-2 text-sm text-zinc-600">Short how-tos for routine tasks outside inspections.</p>
      </div>

      <Card className="border-zinc-200">
        <CardHeader>
          <CardTitle className="text-base">Trips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700 space-y-2">
          <p>
            Use <Link href="/trips" className="text-blue-600 hover:underline">Trips</Link> to start a trip with odometer,
            vehicle, route, and mission type. Complete check-in when you return so distance and status stay accurate.
          </p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200">
        <CardHeader>
          <CardTitle className="text-base">Report a field issue</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700 space-y-2">
          <p>
            <Link href="/report-issue" className="text-blue-600 hover:underline">Report Issue</Link> is for urgent or notable
            problems in the field (breakdown, damage, safety). It is separate from a full inspection checklist but may later
            link into work orders depending on process.
          </p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200">
        <CardHeader>
          <CardTitle className="text-base">Work orders</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700 space-y-2">
          <p>
            Open <Link href="/work-orders" className="text-blue-600 hover:underline">Work Orders</Link> to see jobs by status.
            Failed inspection lines on a <strong>new</strong> submission can create a high-priority order automatically—
            mechanics can take it from there.
          </p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200">
        <CardHeader>
          <CardTitle className="text-base">Daily update</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700 space-y-2">
          <p>
            <Link href="/daily-update" className="text-blue-600 hover:underline">Daily Update</Link> helps generate a text
            summary you can copy for WhatsApp or email (fleet snapshot language from current data).
          </p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200">
        <CardHeader>
          <CardTitle className="text-base">Triage</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700 space-y-2">
          <p>
            <Link href="/triage" className="text-blue-600 hover:underline">Triage</Link> supports prioritization views for HQ
            or leads (capacity and flagged vehicles)—use as your team defines the process.
          </p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200">
        <CardHeader>
          <CardTitle className="text-base">Reports and exports</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700 space-y-2">
          <p>
            Under <Link href="/reports" className="text-blue-600 hover:underline">Reports</Link>, download CSV exports for
            analysis. Inspections export includes checklist JSON for each row—use date filters where offered.
          </p>
        </CardContent>
      </Card>

      <Card className="border-zinc-200">
        <CardHeader>
          <CardTitle className="text-base">Inspections (detail)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-700">
          <p>
            For the full checklist walkthrough, see{" "}
            <Link href="/guide/inspections" className="text-blue-600 font-medium hover:underline">
              Vehicle inspection checklists
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Link href="/guide" className="text-sm text-blue-600 hover:underline">
        ← All guide topics
      </Link>
    </div>
  );
}
