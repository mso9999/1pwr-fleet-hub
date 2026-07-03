"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";

/**
 * Mission lifecycle timeline + pipeline stepper.
 *
 * Renders the full mission → trip lifecycle in one place so reviewers and
 * requesters can see "where is this mission" without jumping between
 * /vehicle-requests, /trips, and /vehicle-checks.
 *
 * Steps: Draft → Pending approval → Approved → Vehicle reserved →
 *         Checked out → Departed → Checked in.
 */

export interface MissionPipelineData {
  id: string;
  approval_status?: string;
  lifecycle_status?: string;
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  approved_at?: string;
  approved_by_name?: string;
  assigned_at?: string | null;
  assigned_by_name?: string | null;
  assigned_vehicle_code?: string | null;
  trip_id?: string | null;
  trip_checkout_at?: string | null;
  trip_departed_at?: string | null;
  trip_checkin_at?: string | null;
  rejection_reason?: string;
}

interface StepDef {
  key: string;
  label: string;
  /** Returns timestamp string if this step is reached, else null. */
  reached: (m: MissionPipelineData) => string | null;
  /** Deep link when the step is clickable. */
  href?: (m: MissionPipelineData) => string | undefined;
}

const STEPS: StepDef[] = [
  {
    key: "draft",
    label: "Draft",
    reached: (m) =>
      String(m.approval_status || "").toLowerCase() === "draft" ? m.created_at || "" : null,
  },
  {
    key: "submitted",
    label: "Submitted",
    reached: (m) => {
      const s = String(m.approval_status || "").toLowerCase();
      return s === "pending" || s === "approved" || s === "revision_requested"
        ? m.created_at || ""
        : null;
    },
  },
  {
    key: "approved",
    label: "Approved",
    reached: (m) =>
      String(m.approval_status || "").toLowerCase() === "approved" ? m.approved_at || "" : null,
  },
  {
    key: "reserved",
    label: "Vehicle reserved",
    reached: (m) => m.assigned_at || null,
    href: (m) => `/trips?mission=${encodeURIComponent(m.id)}`,
  },
  {
    key: "checked_out",
    label: "Checked out",
    reached: (m) => m.trip_checkout_at || null,
    href: (m) => (m.trip_id ? `/trips?trip=${encodeURIComponent(m.trip_id)}` : `/trips?mission=${encodeURIComponent(m.id)}`),
  },
  {
    key: "departed",
    label: "Departed",
    reached: (m) => m.trip_departed_at || null,
    href: (m) => (m.trip_id ? `/trips?trip=${encodeURIComponent(m.trip_id)}` : undefined),
  },
  {
    key: "checked_in",
    label: "Checked in",
    reached: (m) => m.trip_checkin_at || null,
    href: (m) => (m.trip_id ? `/trips?trip=${encodeURIComponent(m.trip_id)}` : undefined),
  },
];

function fmt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Horizontal stepper — compact, used at the top of mission cards. */
export function MissionPipelineStepper({ mission }: { mission: MissionPipelineData }): React.ReactElement {
  const reachedKeys = new Set(
    STEPS.filter((s) => s.reached(mission) !== null).map((s) => s.key)
  );
  const currentIdx = STEPS.reduce((acc, s, i) => (reachedKeys.has(s.key) ? i : acc), -1);

  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px]">
      {STEPS.map((s, i) => {
        const reached = reachedKeys.has(s.key);
        const isCurrent = i === currentIdx;
        const isDraftSkipped =
          s.key === "draft" && reachedKeys.has("submitted") && !reachedKeys.has("draft");
        if (isDraftSkipped) return null;
        const label = s.label;
        const ts = s.reached(mission);
        const href = reached && s.href ? s.href(mission) : undefined;
        const content = (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${
              isCurrent
                ? "bg-blue-600 text-white border-blue-600"
                : reached
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-zinc-50 text-zinc-400 border-zinc-200"
            }`}
          >
            <span className="font-medium">{label}</span>
            {reached && ts && <span className="opacity-70">{fmt(ts)}</span>}
          </span>
        );
        return (
          <li key={s.key} className="flex items-center gap-1">
            {href ? <Link href={href}>{content}</Link> : content}
            {i < STEPS.length - 1 && <span className="text-zinc-300">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Vertical lifecycle timeline — detailed, used in the expanded mission card.
 * Includes actor names and rejection/revision context.
 */
export function MissionLifecycleTimeline({ mission }: { mission: MissionPipelineData }): React.ReactElement {
  const approval = String(mission.approval_status || "").toLowerCase();
  const life = String(mission.lifecycle_status || "active").toLowerCase();
  const stageLabel =
    approval === "draft"
      ? "Draft"
      : approval === "pending"
        ? "Pending approval"
        : approval === "revision_requested"
          ? "Revision requested"
          : approval === "approved"
            ? "Approved"
            : approval === "rejected"
              ? "Rejected"
              : "—";
  const stageTone =
    approval === "approved"
      ? "success"
      : approval === "rejected"
        ? "destructive"
        : approval === "revision_requested"
          ? "warning"
          : "secondary";

  const events: Array<{ label: string; detail?: string; at?: string | null; actor?: string | null }> = [];
  events.push({
    label: "Created",
    at: mission.created_at,
    actor: mission.created_by_name,
  });
  if (approval === "pending" && mission.updated_at && mission.updated_at !== mission.created_at) {
    events.push({ label: "Resubmitted", at: mission.updated_at });
  }
  if (mission.approved_at) {
    events.push({
      label: approval === "rejected" ? "Rejected" : "Approved",
      at: mission.approved_at,
      actor: mission.approved_by_name,
      detail: approval === "rejected" && mission.rejection_reason ? mission.rejection_reason : undefined,
    });
  }
  if (mission.assigned_at) {
    events.push({
      label: "Vehicle reserved",
      at: mission.assigned_at,
      actor: mission.assigned_by_name,
      detail: mission.assigned_vehicle_code ? `Vehicle ${mission.assigned_vehicle_code}` : undefined,
    });
  }
  if (mission.trip_checkout_at) {
    events.push({ label: "Trip checked out", at: mission.trip_checkout_at });
  }
  if (mission.trip_departed_at) {
    events.push({ label: "Departed", at: mission.trip_departed_at });
  }
  if (mission.trip_checkin_at) {
    events.push({ label: "Checked in", at: mission.trip_checkin_at });
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-zinc-700 uppercase tracking-wide">Lifecycle</span>
        <Badge variant={stageTone as "success" | "destructive" | "warning" | "secondary"}>{stageLabel}</Badge>
        {life !== "active" && (
          <Badge variant="secondary" className="capitalize">
            {life}
          </Badge>
        )}
      </div>
      <ol className="mt-2 space-y-1.5 text-xs text-zinc-700">
        {events.map((e, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-zinc-600 min-w-[7rem]">{e.label}:</span>
            <span>{e.at ? fmtTime(e.at) : "—"}</span>
            {e.actor && <span className="text-zinc-500">by {e.actor}</span>}
            {e.detail && <span className="text-zinc-500">· {e.detail}</span>}
          </li>
        ))}
      </ol>
      <div className="mt-2">
        <MissionPipelineStepper mission={mission} />
      </div>
    </div>
  );
}
