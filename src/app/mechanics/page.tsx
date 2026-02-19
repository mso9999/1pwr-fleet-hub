"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

interface MechanicSummary {
  worker_name: string;
  work_orders_touched: number;
  vehicles_touched: number;
  total_hours: number;
  total_cost: number;
  labor_entries: number;
  first_date: string;
  last_date: string;
}

interface DailyEntry {
  work_date: string;
  worker_name: string;
  hours: number;
  vehicles: number;
  work_orders: number;
  vehicle_codes: string;
}

interface DetailEntry {
  id: string;
  worker_name: string;
  work_date: string;
  hours: number;
  rate_per_hour: number;
  description: string;
  role: string;
  work_order_id: string;
  work_order_title: string;
  work_order_status: string;
  vehicle_id: string;
  vehicle_code: string;
  vehicle_make: string;
  vehicle_model: string;
}

interface ActivityData {
  period: string;
  periodStart: string;
  periodEnd: string;
  mechanics: string[];
  summary: MechanicSummary[];
  dailyBreakdown: DailyEntry[];
  detail: DetailEntry[];
}

type Period = "daily" | "weekly" | "monthly";

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  queued: "bg-zinc-100 text-zinc-600",
  "in-progress": "bg-yellow-100 text-yellow-800",
  "awaiting-parts": "bg-red-100 text-red-700",
  completed: "bg-green-100 text-green-700",
  closed: "bg-zinc-200 text-zinc-500",
  "return-repair": "bg-orange-100 text-orange-700",
};

export default function MechanicsPage(): React.ReactElement {
  const { organizationId } = useAuth();
  const [data, setData] = useState<ActivityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("weekly");
  const [selectedMechanic, setSelectedMechanic] = useState<string>("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [expandedMechanic, setExpandedMechanic] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    let url = `/api/mechanic-activity?org=${organizationId}&period=${period}`;
    if (selectedMechanic) url += `&mechanic=${encodeURIComponent(selectedMechanic)}`;
    if (customFrom) url += `&from=${customFrom}`;
    if (customTo) url += `&to=${customTo}`;

    fetch(url)
      .then((r) => r.json())
      .then((d) => { setData(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [organizationId, period, selectedMechanic, customFrom, customTo]);

  function formatHours(h: number): string {
    return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold">Mechanic Activity</h2>
        <div className="flex-1" />
        <div className="flex items-center gap-2 flex-wrap">
          {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => { setPeriod(p); setCustomFrom(""); setCustomTo(""); }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Button>
          ))}
          {data && data.mechanics.length > 0 && (
            <select
              value={selectedMechanic}
              onChange={(e) => setSelectedMechanic(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All Mechanics</option>
              {data.mechanics.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Custom date range */}
      <div className="flex items-center gap-3 text-sm">
        <label className="text-zinc-500">Custom range:</label>
        <input
          type="date"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2 py-1 text-sm"
        />
        <span className="text-zinc-400">to</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2 py-1 text-sm"
        />
        {(customFrom || customTo) && (
          <Button size="sm" variant="ghost" onClick={() => { setCustomFrom(""); setCustomTo(""); }}>
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-zinc-500 text-center py-12">Loading...</div>
      ) : !data || data.summary.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-zinc-400">
            No mechanic activity recorded for this period. Log labor on work orders to see activity here.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Period info */}
          <p className="text-sm text-zinc-500">
            Showing <span className="font-medium text-zinc-700">{data.period}</span> activity from{" "}
            <span className="font-medium text-zinc-700">{data.periodStart}</span> to{" "}
            <span className="font-medium text-zinc-700">{data.periodEnd}</span>
          </p>

          {/* Summary cards per mechanic */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.summary.map((m) => (
              <Card
                key={m.worker_name}
                className={`cursor-pointer transition-shadow hover:shadow-md ${expandedMechanic === m.worker_name ? "ring-2 ring-blue-500" : ""}`}
                onClick={() => setExpandedMechanic(expandedMechanic === m.worker_name ? null : m.worker_name)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{m.worker_name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{formatHours(m.total_hours)}</div>
                      <div className="text-xs text-zinc-500">Total Hours</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-zinc-700">{m.vehicles_touched}</div>
                      <div className="text-xs text-zinc-500">Vehicles</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-zinc-600">{m.work_orders_touched}</div>
                      <div className="text-xs text-zinc-500">Work Orders</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-zinc-600">{m.labor_entries}</div>
                      <div className="text-xs text-zinc-500">Log Entries</div>
                    </div>
                    {m.total_cost > 0 && (
                      <div className="col-span-2">
                        <div className="text-sm font-medium text-green-700">R {m.total_cost.toLocaleString()}</div>
                        <div className="text-xs text-zinc-500">Labor Cost</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Daily Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {data.dailyBreakdown.length === 0 ? (
                <p className="text-sm text-zinc-400">No daily entries for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs font-medium text-zinc-500 uppercase">
                        <th className="pb-2 pr-4">Date</th>
                        <th className="pb-2 pr-4">Mechanic</th>
                        <th className="pb-2 pr-4">Hours</th>
                        <th className="pb-2 pr-4">Vehicles</th>
                        <th className="pb-2 pr-4">Work Orders</th>
                        <th className="pb-2 pr-4">Vehicle Codes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dailyBreakdown.map((row, i) => (
                        <tr key={`${row.work_date}-${row.worker_name}-${i}`} className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="py-2 pr-4 font-medium">{row.work_date}</td>
                          <td className="py-2 pr-4">{row.worker_name}</td>
                          <td className="py-2 pr-4 font-medium text-blue-600">{formatHours(row.hours)}</td>
                          <td className="py-2 pr-4">{row.vehicles}</td>
                          <td className="py-2 pr-4">{row.work_orders}</td>
                          <td className="py-2 pr-4">
                            <div className="flex flex-wrap gap-1">
                              {row.vehicle_codes?.split(",").map((code) => (
                                <span key={code} className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700">
                                  {code}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expanded mechanic detail */}
          {expandedMechanic && (
            <Card>
              <CardHeader>
                <CardTitle>{expandedMechanic} — Detailed Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const entries = data.detail.filter((d) => d.worker_name === expandedMechanic);
                  if (entries.length === 0) return <p className="text-sm text-zinc-400">No detailed entries.</p>;

                  const byDate = entries.reduce<Record<string, DetailEntry[]>>((acc, e) => {
                    (acc[e.work_date] = acc[e.work_date] || []).push(e);
                    return acc;
                  }, {});

                  return (
                    <div className="space-y-4">
                      {Object.entries(byDate).sort(([a], [b]) => b.localeCompare(a)).map(([date, items]) => (
                        <div key={date}>
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-sm font-semibold text-zinc-700">{date}</h4>
                            <span className="text-xs text-zinc-400">
                              {formatHours(items.reduce((s, i) => s + i.hours, 0))} total
                            </span>
                          </div>
                          <div className="space-y-1.5 pl-3 border-l-2 border-zinc-200">
                            {items.map((entry) => (
                              <div key={entry.id} className="flex items-start gap-3 text-sm">
                                <span className="font-medium text-blue-600 min-w-[3rem]">{formatHours(entry.hours)}</span>
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700 min-w-[3rem] text-center">
                                  {entry.vehicle_code}
                                </span>
                                <div className="flex-1">
                                  <span className="text-zinc-700">{entry.work_order_title}</span>
                                  {entry.description && (
                                    <span className="text-zinc-400 ml-1">— {entry.description}</span>
                                  )}
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.work_order_status] || "bg-zinc-100 text-zinc-600"}`}>
                                  {entry.work_order_status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Fleet totals */}
          <Card>
            <CardHeader>
              <CardTitle>Period Totals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-4 text-center">
                <div>
                  <div className="text-3xl font-bold text-blue-600">
                    {formatHours(data.summary.reduce((s, m) => s + m.total_hours, 0))}
                  </div>
                  <div className="text-sm text-zinc-500">Total Labor Hours</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-zinc-700">
                    {data.summary.length}
                  </div>
                  <div className="text-sm text-zinc-500">Active Mechanics</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-zinc-700">
                    {data.summary.reduce((s, m) => s + m.work_orders_touched, 0)}
                  </div>
                  <div className="text-sm text-zinc-500">Work Orders Touched</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-green-600">
                    R {data.summary.reduce((s, m) => s + m.total_cost, 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-zinc-500">Total Labor Cost</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
