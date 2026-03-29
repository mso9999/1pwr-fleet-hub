import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  {
    id: "before-you-start",
    title: "Before you start",
    body: (
      <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-700">
        <li>
          <strong>Sign in</strong> with your 1PWR email. If the app keeps loading, check your connection or ask IT to confirm your account exists in the PR user directory.
        </li>
        <li>
          <strong>Organization</strong> appears at the bottom of the sidebar if you have access to more than one. Pick the country or entity you are working for; vehicle lists and inspections follow that choice.
        </li>
        <li>
          The <strong>vehicle dropdown</strong> only lists vehicles already synced for that organization. If a truck is missing, fleet admin may need to sync or add it first.
        </li>
      </ul>
    ),
  },
  {
    id: "open-inspections",
    title: "1. Open Inspections",
    body: (
      <p className="text-sm text-zinc-700">
        In the left menu, tap <strong>Inspections</strong>. You will see saved checklists (newest first, up to 500) and a{" "}
        <strong>+ New inspection</strong> button at the top.
      </p>
    ),
  },
  {
    id: "start-new",
    title: "2. Start a new checklist",
    body: (
      <p className="text-sm text-zinc-700">
        Tap <strong>+ New inspection</strong>. The form opens in place on the same page—nothing is saved until you submit.
      </p>
    ),
  },
  {
    id: "choose-type",
    title: "3. Choose the checklist type",
    body: (
      <div className="space-y-3 text-sm text-zinc-700">
        <p>Use the three tabs at the top of the form:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Pre-departure (quick)</strong> — shorter list focused on safety before a trip (lights, fluids, tires, cab
            checks, etc.).
          </li>
          <li>
            <strong>Detailed mechanical</strong> — everything in the quick list plus deeper mechanical items (brakes,
            suspension, drivetrain, and more).
          </li>
          <li>
            <strong>1PWR checklist (2025) — full</strong> — the full structured checklist used for driver proficiency /
            compliance-style reviews. Flow and sections follow that template.
          </li>
        </ul>
        <p className="text-zinc-600">
          Switching type clears ratings and notes on the current draft so you do not mix templates by mistake.
        </p>
      </div>
    ),
  },
  {
    id: "vehicle-inspector",
    title: "4. Vehicle and inspector",
    body: (
      <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-700">
        <li>
          <strong>Vehicle *</strong> — required. Choose the correct code; the saved record is tied to that vehicle for history
          and work orders.
        </li>
        <li>
          <strong>Inspector name *</strong> — required. Enter your name as it should appear on the record (e.g. for audits or
          follow-up).
        </li>
      </ul>
    ),
  },
  {
    id: "rate-lines",
    title: "5. Complete each line (Pass / Warn / Fail)",
    body: (
      <div className="space-y-3 text-sm text-zinc-700">
        <p>Each row is one checklist item, grouped by category (Exterior, Fluids, Engine, etc.).</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-emerald-700">Pass (✓)</strong> — item is OK. This is the default if you do not tap
            anything else.
          </li>
          <li>
            <strong className="text-amber-700">Warn (!)</strong> — something needs attention soon but is not an immediate
            safety failure. Add a short note if helpful.
          </li>
          <li>
            <strong className="text-red-700">Fail (✗)</strong> — item failed or is unsafe. The app will not let you submit
            until you add a <strong>line note</strong>, at least one <strong>photo</strong> for that row, or a{" "}
            <strong>note on a body-plan mark</strong> (see below).
          </li>
        </ul>
        <p>
          Use the <strong>Note</strong> field on the row for free text (e.g. “Left rear tire low ~1.8 bar”).
        </p>
        <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-800">
          <strong>Body plan (top view):</strong> on the line <strong>Body / panels (Mark damage with X)</strong> (quick and
          detailed checklists) and on <strong>Body — (Mark damage with X)</strong> (2025 checklist), a{" "}
          <strong>plan-view drawing</strong> appears. Tap the vehicle diagram to place <strong>X</strong> marks; add a short
          description for each mark. Saved inspections show this diagram when you expand a card.
        </p>
        <p className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-amber-900">
          <strong>Automatic work order:</strong> when you <strong>submit a new</strong> inspection, any line marked{" "}
          <strong>Fail</strong> triggers creation of a <strong>high-priority</strong> work order for that vehicle, with a
          title summarizing failed items. <strong>Warn</strong> alone does not create a work order. Editing an old inspection
          later does not create new work orders.
        </p>
      </div>
    ),
  },
  {
    id: "submit",
    title: "6. Submit",
    body: (
      <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-700">
        <li>
          Tap <strong>Submit inspection</strong> when finished. Wait for the button to finish; then the form closes and your
          checklist appears in the list.
        </li>
        <li>
          Tap <strong>Cancel</strong> to close the form without saving.
        </li>
        <li>
          The overall result is <strong>pass</strong> if there are no <strong>Fail</strong> lines; any <strong>Fail</strong>{" "}
          marks the inspection as failed overall (and opens the work order path above).
        </li>
      </ul>
    ),
  },
  {
    id: "after-saved",
    title: "7. After it is saved",
    body: (
      <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-700">
        <li>
          <strong>Expand a card</strong> — tap the header row to show every line, rating, and note.
        </li>
        <li>
          <strong>Edit</strong> — change vehicle, inspector, or any line; save updates the record (badges reflect fail / warn
          counts).
        </li>
        <li>
          <strong>Delete</strong> — permanently removes that inspection after you confirm.
        </li>
        <li>
          For spreadsheets or archives, use <Link href="/reports" className="text-blue-600 font-medium hover:underline">Reports</Link>{" "}
          and export inspections as CSV (see the user guide section on daily workflows when published).
        </li>
      </ul>
    ),
  },
] as const;

export default function GuideInspectionsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <div>
        <Link href="/guide" className="text-sm text-blue-600 hover:underline">
          ← User guide
        </Link>
        <h2 className="mt-3 text-2xl font-semibold text-zinc-900">Vehicle inspection checklists</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Walkthrough aligned with the <Link href="/inspections" className="text-blue-600 font-medium hover:underline">Inspections</Link>{" "}
          screen in Fleet Hub.
        </p>
      </div>

      <nav aria-label="On this page" className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">On this page</div>
        <ol className="mt-2 space-y-1.5 text-sm">
          {STEPS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-blue-700 hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-6">
        {STEPS.map((s) => (
          <Card key={s.id} id={s.id} className="scroll-mt-24 border-zinc-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{s.title}</CardTitle>
            </CardHeader>
            <CardContent>{s.body}</CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/inspections"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
        >
          Go to Inspections
        </Link>
        <Link
          href="/guide"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 min-h-[44px]"
        >
          All guide topics
        </Link>
      </div>
    </div>
  );
}
