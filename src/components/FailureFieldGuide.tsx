/**
 * Inline guidance for the structured failure record on work orders.
 * Keeps symptom / diagnosis / intervention distinct — the classic failure is
 * conflation ("overheating" is a symptom, not a diagnosis; "replace clutch"
 * is an intervention, not a symptom).
 */
import React from "react";

export type FailureFieldKind = "symptom" | "diagnosis" | "intervention";

const GUIDES: Record<FailureFieldKind, { hint: string; good: string; not: string }> = {
  symptom: {
    hint: "What was observed — seen, heard, smelled, or measured. Reported by whoever noticed it.",
    good: "e.g. “Temperature gauge in the red after 20 min”, “Grinding noise when braking”, “Won’t start — single click”",
    not: "Not a fix (“replace clutch”) or a guessed cause (“worn clutch”) — just what was observed.",
  },
  diagnosis: {
    hint: "The root cause confirmed by inspection or testing — filled in by the mechanic/EHS once known.",
    good: "e.g. “Water pump bearing failed — coolant leaking at the weep hole”, “Clutch disc worn to the rivets”",
    not: "Not the symptom restated (“overheating” is the symptom — why it overheats is the diagnosis).",
  },
  intervention: {
    hint: "The work actually performed to resolve it.",
    good: "e.g. “Replaced water pump and coolant, bled system, road-tested 15 min — gauge normal”",
    not: "Not the symptom or the part name alone — say what was done, and the verification if there was one.",
  },
};

export function FailureFieldGuide({ kind }: { kind: FailureFieldKind }): React.ReactElement {
  const g = GUIDES[kind];
  return (
    <div className="rounded-md border border-sky-100 bg-sky-50/60 px-2.5 py-2 text-[11px] leading-snug text-zinc-600">
      <p>{g.hint}</p>
      <p className="mt-1 text-emerald-800">{g.good}</p>
      <p className="mt-0.5 text-amber-800">{g.not}</p>
    </div>
  );
}
