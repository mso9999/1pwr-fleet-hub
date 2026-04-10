"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";

interface TcoRow {
  vehicleId: string;
  vehicleCode: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehicleStatus: string;
  purchasePrice: number;
  purchaseCurrency: string;
  totalMileageKm: number;
  monthsInService: number;
  totalRepairCost: number;
  totalInsurance: number;
  totalCostOfOwnership: number;
  monthlyBurnRate: number;
  costPerKm: number;
  currentBookValue: number;
  repairToValueRatio: number;
  workOrderCount: number;
  totalDowntimeDays: number;
  avgRepairDays: number;
}

interface EolRow {
  vehicleId: string;
  vehicleCode: string;
  vehicleMake: string;
  vehicleModel: string;
  eolScore: number;
  eolBand: string;
  factors: Record<string, number>;
  details: Record<string, unknown>;
}

interface PerfCohort {
  cohort: string;
  vehicleCount: number;
  avgRepairCostPerVehicle: number;
  avgWorkOrdersPerVehicle: number;
  avgDowntimeDaysPerVehicle: number;
  avgCostPerKm: number;
  avgMileageKm: number;
}

type ViewTab = "tco" | "eol" | "ranking";

export default function TcoPage() {
  const { organizationId } = useAuth();
  const [tco, setTco] = useState<TcoRow[]>([]);
  const [eol, setEol] = useState<EolRow[]>([]);
  const [perf, setPerf] = useState<PerfCohort[]>([]);
  const [perfGroupBy, setPerfGroupBy] = useState("make");
  const [view, setView] = useState<ViewTab>("tco");
  const [isLoading, setIsLoading] = useState(true);

  const loadTco = useCallback(() => {
    fetch(`/api/vehicles/tco?org=${organizationId}`).then((r) => r.json()).then(setTco).catch(() => {});
  }, [organizationId]);

  const loadEol = useCallback(() => {
    fetch(`/api/analytics/eol?org=${organizationId}`).then((r) => r.json()).then(setEol).catch(() => {});
  }, [organizationId]);

  const loadPerf = useCallback(() => {
    fetch(`/api/analytics/performance?org=${organizationId}&groupBy=${perfGroupBy}`)
      .then((r) => r.json())
      .then((d) => setPerf(d.cohorts || []))
      .catch(() => {});
  }, [organizationId, perfGroupBy]);

  useEffect(() => {
    Promise.all([loadTco(), loadEol(), loadPerf()]).then(() => setIsLoading(false));
  }, [loadTco, loadEol, loadPerf]);

  useEffect(() => { loadPerf(); }, [loadPerf]);

  const totalFleetValue = tco.reduce((s, v) => s + v.purchasePrice, 0);
  const totalRepairSpend = tco.reduce((s, v) => s + v.totalRepairCost, 0);
  const totalTco = tco.reduce((s, v) => s + v.totalCostOfOwnership, 0);
  const eolWarnings = eol.filter((e) => e.eolBand === "end-of-life" || e.eolBand === "monitor").length;

  function fmt(n: number): string { return n.toLocaleString(undefined, { maximumFractionDigits: 0 }); }

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex flex-wrap gap-2">
        {([["tco", "Cost of Ownership"], ["eol", "End of Life"], ["ranking", "Performance Ranking"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium touch-manipulation min-h-[44px] ${
              view === key ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-zinc-500 text-center py-12">Loading analytics…</div>
      ) : view === "tco" ? (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card><CardContent className="p-3 text-center"><div className="text-xl font-bold">{fmt(totalFleetValue)}</div><div className="text-xs text-zinc-500">Fleet Purchase Value</div></CardContent></Card>
            <Card><CardContent className="p-3 text-center"><div className="text-xl font-bold">{fmt(totalRepairSpend)}</div><div className="text-xs text-zinc-500">Total Repair Spend</div></CardContent></Card>
            <Card><CardContent className="p-3 text-center"><div className="text-xl font-bold">{fmt(totalTco)}</div><div className="text-xs text-zinc-500">Total Cost of Ownership</div></CardContent></Card>
            <Card><CardContent className="p-3 text-center"><div className="text-xl font-bold text-amber-600">{eolWarnings}</div><div className="text-xs text-zinc-500">EOL Warnings</div></CardContent></Card>
          </div>

          {/* TCO table */}
          <Card>
            <CardHeader><CardTitle>Cost of Ownership by Vehicle</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-zinc-500 uppercase">
                    <th className="pb-2 pr-3">Vehicle</th>
                    <th className="pb-2 pr-3 text-right">Purchase</th>
                    <th className="pb-2 pr-3 text-right">Repairs</th>
                    <th className="pb-2 pr-3 text-right">TCO</th>
                    <th className="pb-2 pr-3 text-right">Cost/km</th>
                    <th className="pb-2 pr-3 text-right">Monthly</th>
                    <th className="pb-2 pr-3 text-right">Repair/Value</th>
                    <th className="pb-2 pr-3 text-right">WOs</th>
                    <th className="pb-2 text-right">Downtime</th>
                  </tr>
                </thead>
                <tbody>
                  {tco.map((v) => (
                    <tr key={v.vehicleId} className="border-b border-zinc-50 hover:bg-zinc-50">
                      <td className="py-2 pr-3">
                        <span className="font-bold">{v.vehicleCode}</span>
                        <span className="text-zinc-400 ml-1 text-xs">{v.vehicleMake} {v.vehicleModel}</span>
                      </td>
                      <td className="py-2 pr-3 text-right">{fmt(v.purchasePrice)}</td>
                      <td className="py-2 pr-3 text-right">{fmt(v.totalRepairCost)}</td>
                      <td className="py-2 pr-3 text-right font-semibold">{fmt(v.totalCostOfOwnership)}</td>
                      <td className="py-2 pr-3 text-right">{v.costPerKm.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-right">{fmt(v.monthlyBurnRate)}</td>
                      <td className="py-2 pr-3 text-right">
                        <span className={v.repairToValueRatio > 0.5 ? "text-red-600 font-semibold" : v.repairToValueRatio > 0.3 ? "text-amber-600" : ""}>
                          {(v.repairToValueRatio * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right">{v.workOrderCount}</td>
                      <td className="py-2 text-right">{v.totalDowntimeDays}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      ) : view === "eol" ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">Composite score 0-100. Vehicles scoring 71+ are flagged end-of-life.</p>
          {eol.map((v) => (
            <Card key={v.vehicleId} className={v.eolBand === "end-of-life" ? "border-red-200" : v.eolBand === "monitor" ? "border-amber-200" : ""}>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-base font-bold">{v.vehicleCode}</Badge>
                    <span className="text-sm text-zinc-600">{v.vehicleMake} {v.vehicleModel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${v.eolBand === "end-of-life" ? "text-red-600" : v.eolBand === "monitor" ? "text-amber-600" : "text-emerald-600"}`}>
                      {v.eolScore}
                    </span>
                    <Badge variant={v.eolBand === "end-of-life" ? "destructive" : v.eolBand === "monitor" ? "warning" : "success"}>
                      {v.eolBand}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {Object.entries(v.factors).map(([key, score]) => (
                    <div key={key} className="text-center">
                      <div className={`text-sm font-semibold ${score > 70 ? "text-red-600" : score > 40 ? "text-amber-600" : "text-zinc-700"}`}>{score}</div>
                      <div className="text-[10px] text-zinc-400 capitalize">{key.replace(/Score$/, "").replace(/([A-Z])/g, " $1").trim()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select label="Group by" value={perfGroupBy} onChange={(e) => setPerfGroupBy(e.target.value)}>
              <option value="make">Make</option>
              <option value="model">Model</option>
              <option value="fuel_type">Fuel type</option>
              <option value="transmission">Transmission</option>
              <option value="year">Year</option>
              <option value="asset_class">Asset class</option>
            </Select>
          </div>
          <Card>
            <CardHeader><CardTitle>Fleet Performance by {perfGroupBy.replace(/_/g, " ")}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-zinc-500 uppercase">
                    <th className="pb-2 pr-3">Cohort</th>
                    <th className="pb-2 pr-3 text-right">Vehicles</th>
                    <th className="pb-2 pr-3 text-right">Avg km</th>
                    <th className="pb-2 pr-3 text-right">Avg repair cost</th>
                    <th className="pb-2 pr-3 text-right">Avg WOs</th>
                    <th className="pb-2 pr-3 text-right">Avg downtime</th>
                    <th className="pb-2 text-right">Cost/km</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.map((c) => (
                    <tr key={c.cohort} className="border-b border-zinc-50 hover:bg-zinc-50">
                      <td className="py-2 pr-3 font-medium capitalize">{c.cohort || "—"}</td>
                      <td className="py-2 pr-3 text-right">{c.vehicleCount}</td>
                      <td className="py-2 pr-3 text-right">{fmt(c.avgMileageKm)}</td>
                      <td className="py-2 pr-3 text-right">{fmt(c.avgRepairCostPerVehicle)}</td>
                      <td className="py-2 pr-3 text-right">{c.avgWorkOrdersPerVehicle}</td>
                      <td className="py-2 pr-3 text-right">{c.avgDowntimeDaysPerVehicle}d</td>
                      <td className="py-2 text-right">{c.avgCostPerKm.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
