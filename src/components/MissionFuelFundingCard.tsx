"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { canActOnMissionFuel } from "@/lib/fleet-roles";

export const PR_APP_BASE_URL = "https://pr.1pwrafrica.com";

export interface MissionPrLink {
  pr_id: string;
  pr_number: string;
  pr_status: string;
  kind: string;
  amount: number | null;
  currency: string;
  requestor_name?: string;
  synced_at?: string;
}

export interface FuelFundingMission {
  id: string;
  organization_id?: string;
  title: string;
  destination: string;
  departure_date: string;
  return_date: string;
  created_by_id?: string;
  created_by_name?: string;
  transport_mode?: string | null;
  lifecycle_status?: string;
  fuel_total_km?: number | null;
  fuel_budget?: number | null;
  fuel_currency?: string | null;
  fuel_disposition?: string | null;
  pr_links?: MissionPrLink[];
}

const DISPOSITION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pr_requested", label: "Own fuel PR" },
  { value: "in_deployment_budget", label: "Deployment budget" },
  { value: "", label: "Undecided" },
];

function prStatusVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  const s = status.toUpperCase();
  if (["APPROVED", "ORDERED", "COMPLETED", "PO", "PAID"].some((k) => s.includes(k))) return "success";
  if (s.includes("REJECT") || s.includes("CANCEL")) return "destructive";
  if (s.includes("PENDING") || s.includes("SUBMITTED") || s.includes("REVISION") || s.includes("PROCUREMENT")) {
    return "warning";
  }
  return "secondary";
}

export function fuelPrUrl(m: Pick<FuelFundingMission, "id" | "organization_id">, organizationId: string): string {
  const org = m.organization_id || organizationId;
  return `${PR_APP_BASE_URL}/fuel-pr?mission=${encodeURIComponent(m.id)}&org=${encodeURIComponent(org)}`;
}

export function deploymentBudgetUrl(
  m: Pick<FuelFundingMission, "id" | "organization_id">,
  organizationId: string
): string {
  const org = m.organization_id || organizationId;
  return `${PR_APP_BASE_URL}/deployment-budget?mission=${encodeURIComponent(m.id)}&org=${encodeURIComponent(org)}`;
}

/** Fuel PR / deployment-budget actions and linked-PR status for approved missions. */
export function MissionFuelFundingCard({
  missions,
  organizationId,
  user,
  onChanged,
}: {
  missions: FuelFundingMission[];
  organizationId: string;
  user: { id: string; role?: string } | null;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const visible = missions.filter((m) => {
    if (!user) return false;
    if (m.lifecycle_status && m.lifecycle_status !== "active") return false;
    if ((m.transport_mode || "company_vehicle") !== "company_vehicle") return false;
    const lastDay = String(m.return_date || m.departure_date || "").slice(0, 10);
    if (lastDay && lastDay < today) return false;
    return canActOnMissionFuel({
      role: user.role || "",
      isCreator: String(m.created_by_id || "") === user.id,
    });
  });
  if (visible.length === 0) return null;

  async function refreshLinks(missionId: string) {
    setBusyId(missionId);
    setError(null);
    try {
      const headers = await jsonHeadersWithBearer();
      const res = await fetch(`/api/missions/${encodeURIComponent(missionId)}/pr-links`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; sync?: { error?: string } };
        setError(j.sync?.error || j.error || "Could not check the PR system.");
      }
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function setDisposition(missionId: string, fuelDisposition: string) {
    setBusyId(missionId);
    setError(null);
    try {
      const headers = await jsonHeadersWithBearer();
      const res = await fetch(`/api/missions/${encodeURIComponent(missionId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action: "set_fuel_disposition", fuelDisposition }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || "Could not update fuel funding.");
      }
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="border-sky-200 bg-sky-50/30">
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <CardTitle className="text-base">Fuel funding for approved missions ({visible.length})</CardTitle>
          <span className="text-xs text-zinc-500 shrink-0">{open ? "Hide ▲" : "Show ▼"}</span>
        </button>
        {open && (
          <p className="text-sm text-zinc-600 font-normal">
            Raise a fuel PR in the PR system, or put fuel in the deployment budget. Both open pre-filled from the
            mission. Linked PRs show here once they are filed. Status is checked hourly, or press Check PR status.
            Missions that have already returned are not listed.
          </p>
        )}
      </CardHeader>
      {open && (
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-red-700">{error}</p>}
        {visible.map((m) => {
          const links = m.pr_links ?? [];
          const budget =
            m.fuel_budget != null && m.fuel_budget > 0
              ? `${m.fuel_budget.toLocaleString()} ${m.fuel_currency || ""}`
              : null;
          const disposition = String(m.fuel_disposition || "");
          const busy = busyId === m.id;
          return (
            <div key={m.id} className="rounded-lg border border-sky-100 bg-white px-3 py-2 text-sm space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-zinc-900">{(m.title || m.destination).slice(0, 80)}</span>
                  <span className="text-zinc-500 ml-2 block sm:inline">
                    {m.destination} · {m.departure_date}
                    {m.return_date ? ` → ${m.return_date}` : ""}
                    {m.created_by_name ? ` · by ${m.created_by_name}` : ""}
                  </span>
                  <div className="text-xs text-zinc-600 mt-1">
                    <span className="font-medium">Fuel budget:</span>{" "}
                    {budget ?? "not calculated yet"}
                    {m.fuel_total_km ? ` · ${m.fuel_total_km} km` : ""}
                  </div>
                </div>
                <label className="text-xs text-zinc-600 flex items-center gap-1 shrink-0">
                  Funded by
                  <select
                    className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs"
                    value={disposition}
                    disabled={busy}
                    onChange={(e) => void setDisposition(m.id, e.target.value)}
                  >
                    {DISPOSITION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {links.length > 0 && (
                <ul className="space-y-1">
                  {links.map((l) => (
                    <li key={l.pr_id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-zinc-500">
                        {l.kind === "deployment" ? "Deployment budget" : "Fuel PR"}
                      </span>
                      <a
                        href={`${PR_APP_BASE_URL}/pr/${encodeURIComponent(l.pr_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sky-800 underline"
                      >
                        {l.pr_number || l.pr_id}
                      </a>
                      <Badge variant={prStatusVariant(l.pr_status)} className="text-[10px]">
                        {l.pr_status.replace(/_/g, " ") || "unknown"}
                      </Badge>
                      {l.amount != null && (
                        <span className="text-zinc-600">
                          {l.amount.toLocaleString()} {l.currency}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2">
                {disposition !== "in_deployment_budget" &&
                  (budget ? (
                    <a href={fuelPrUrl(m, organizationId)} target="_blank" rel="noopener noreferrer">
                      <Button type="button" size="sm">
                        {links.some((l) => l.kind === "fuel") ? "Raise another fuel PR" : "Raise fuel PR"}
                      </Button>
                    </a>
                  ) : (
                    <Button type="button" size="sm" disabled title="Calculate the fuel budget on the mission first">
                      Raise fuel PR
                    </Button>
                  ))}
                {disposition !== "pr_requested" && (
                  <a href={deploymentBudgetUrl(m, organizationId)} target="_blank" rel="noopener noreferrer">
                    <Button type="button" size="sm" variant="outline">
                      Open deployment budget
                    </Button>
                  </a>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void refreshLinks(m.id)}
                >
                  {busy ? "Checking…" : "Check PR status"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
      )}
    </Card>
  );
}
