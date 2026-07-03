"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";

interface TriageFactors {
  partsReady: number;
  operationalUrgency: number;
  hqSkillMatch: number;
  daysWaiting: number;
}

interface TriageRow {
  workOrderId: string;
  vehicleCode: string;
  title: string;
  status: string;
  priority: string;
  repairLocation: string;
  assignedTo: string;
  daysWaiting: number;
  score: number;
  band: string;
  factors: TriageFactors;
  notes: string;
}

interface TriageResponse {
  maxBays: number;
  hqQueueCount: number;
  overCapacity: boolean;
  flaggedLowPriorityIds: string[];
  rows: TriageRow[];
}

const BAND_STYLE: Record<string, string> = {
  "keep-hq": "bg-emerald-100 text-emerald-800",
  review: "bg-amber-100 text-amber-900",
  "recommend-3rd-party": "bg-rose-100 text-rose-800",
};

export default function TriagePage(): React.ReactElement {
  const { organizationId } = useAuth();
  const [maxBays, setMaxBays] = useState(4);
  const [data, setData] = useState<TriageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/triage?org=${organizationId}&maxBays=${maxBays}`)
      .then((r) => r.json())
      .then((d: TriageResponse) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, maxBays]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Triage &amp; HQ capacity</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Scores follow spec §9: parts, urgency, HQ skill fit, days waiting. Above 70 = keep at HQ; 40–70 = review; below 40 = consider 3rd party.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          Max HQ bays
          <Input
            type="number"
            min={1}
            max={20}
            className="w-20"
            value={maxBays}
            onChange={(e) => setMaxBays(parseInt(e.target.value, 10) || 4)}
          />
        </label>
        {data && (
          <span className="text-sm text-zinc-600">
            HQ / field queue: <strong>{data.hqQueueCount}</strong> open work orders
            {data.overCapacity && (
              <Badge variant="destructive" className="ml-2">
                Over capacity — lowest scores flagged
              </Badge>
            )}
          </span>
        )}
      </div>

      {loading && <p className="text-zinc-500">Loading triage…</p>}

      {data && !loading && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open work orders (HQ / field)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  <th className="py-2 pr-2">Vehicle</th>
                  <th className="py-2 pr-2">Title</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Score</th>
                  <th className="py-2 pr-2">Band</th>
                  <th className="py-2 pr-2">Days</th>
                  <th className="py-2 pr-2">Assigned</th>
                  <th className="py-2">Factors (P/U/H/D)</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={r.workOrderId}
                    className={`border-b border-zinc-100 ${
                      data.flaggedLowPriorityIds.includes(r.workOrderId) ? "bg-rose-50" : ""
                    }`}
                  >
                    <td className="py-2 pr-2 font-medium">{r.vehicleCode}</td>
                    <td className="py-2 pr-2 max-w-[200px] truncate" title={r.title}>
                      {r.title}
                    </td>
                    <td className="py-2 pr-2">
                      <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-zinc-100 capitalize">
                        {r.status.replace(/-/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-2 font-mono">{r.score}</td>
                    <td className="py-2 pr-2">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${BAND_STYLE[r.band] || "bg-zinc-100"}`}
                      >
                        {r.band.replace(/-/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-2">{r.daysWaiting}</td>
                    <td className="py-2 pr-2 text-zinc-600">{r.assignedTo || "—"}</td>
                    <td className="py-2 text-xs text-zinc-500">
                      {r.factors.partsReady}/{r.factors.operationalUrgency}/{r.factors.hqSkillMatch}/{r.factors.daysWaiting}
                      <div className="text-zinc-400 mt-0.5 max-w-xs truncate" title={r.notes}>
                        {r.notes}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.rows.length === 0 && (
              <p className="text-zinc-500 py-6 text-center">No open HQ/field work orders.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
