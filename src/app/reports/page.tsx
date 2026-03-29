"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";

type ExportType = "work-orders" | "vehicles" | "trips" | "cost-summary" | "inspections";

export default function ReportsPage(): React.ReactElement {
  const { organizationId } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function href(type: ExportType): string {
    const p = new URLSearchParams({ org: organizationId, type, format: "csv" });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return `/api/reports/export?${p.toString()}`;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Reports &amp; exports</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Download CSV summaries for cost tracking, downtime analysis, and historical trends (Phase 4).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Date filter</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">From (optional)</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">To (optional)</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </div>
          <p className="text-xs text-zinc-500 flex-1 min-w-[200px]">
            Applies to work orders and trips. Vehicle registry and cost-by-vehicle ignore these unless you add a custom range later.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(
          [
            ["work-orders", "Work orders (with downtime days)"],
            ["vehicles", "Vehicle registry"],
            ["trips", "Trips"],
            ["cost-summary", "Cost summary by vehicle"],
            ["inspections", "Inspections / checklists (JSON lines in items_json)"],
          ] as const
        ).map(([type, label]) => (
          <a
            key={type}
            href={href(type)}
            download
            className="flex w-full items-center rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
