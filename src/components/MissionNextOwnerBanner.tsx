"use client";

import Link from "next/link";
import {
  resolveMissionNextOwner,
  type MissionNextOwnerInput,
} from "@/lib/mission-next-owner";

const TONE: Record<
  "amber" | "blue" | "emerald" | "zinc",
  string
> = {
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  blue: "border-sky-200 bg-sky-50 text-sky-950",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
  zinc: "border-zinc-200 bg-zinc-50 text-zinc-700",
};

/**
 * Compact “who acts next” banner for mission cards and request details.
 */
export function MissionNextOwnerBanner({
  mission,
  className = "",
}: {
  mission: MissionNextOwnerInput;
  className?: string;
}): React.ReactElement | null {
  const next = resolveMissionNextOwner(mission);
  if (next.kind === "none" || next.kind === "done") {
    return null;
  }

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${TONE[next.tone]} ${className}`}
      data-testid="mission-next-owner"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
        Next owner
      </div>
      <div className="font-semibold mt-0.5">{next.owner}</div>
      <p className="mt-0.5 text-xs leading-snug opacity-95">{next.action}</p>
      {next.href && (
        <Link
          href={next.href}
          className="mt-1.5 inline-block text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
        >
          {next.kind === "create_trip"
            ? "Create trip →"
            : next.kind === "allocate_vehicle"
              ? "Open Missions (allocate) →"
              : "Open trip →"}
        </Link>
      )}
    </div>
  );
}
