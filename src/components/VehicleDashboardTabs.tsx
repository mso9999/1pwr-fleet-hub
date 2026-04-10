"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";

interface Props {
  vehicleId: string;
  vehicleCode: string;
}

type Tab = "overview" | "trips" | "maintenance" | "costs";

export function VehicleDashboardTabs({ vehicleId, vehicleCode }: Props) {
  const { organizationId } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [tco, setTco] = useState<Record<string, unknown> | null>(null);
  const [eol, setEol] = useState<Record<string, unknown> | null>(null);
  const [trips, setTrips] = useState<Array<Record<string, unknown>>>([]);
  const [maintenance, setMaintenance] = useState<Array<Record<string, unknown>>>([]);
  const [checks, setChecks] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetch(`/api/vehicles/tco?org=${organizationId}`)
      .then((r) => r.json())
      .then((rows: Array<Record<string, unknown>>) => {
        const match = rows.find((r) => r.vehicleId === vehicleId);
        if (match) setTco(match);
      })
      .catch(() => {});

    fetch(`/api/analytics/eol?org=${organizationId}`)
      .then((r) => r.json())
      .then((rows: Array<Record<string, unknown>>) => {
        const match = rows.find((r) => r.vehicleId === vehicleId);
        if (match) setEol(match);
      })
      .catch(() => {});

    fetch(`/api/trips?org=${organizationId}&vehicleId=${vehicleId}`)
      .then((r) => r.json())
      .then(setTrips)
      .catch(() => {});

    fetch(`/api/scheduled-maintenance?org=${organizationId}&vehicleId=${vehicleId}`)
      .then((r) => r.json())
      .then(setMaintenance)
      .catch(() => {});

    fetch(`/api/driver-vehicle-checks?org=${organizationId}&vehicleId=${vehicleId}&limit=10`)
      .then((r) => r.json())
      .then(setChecks)
      .catch(() => {});
  }, [vehicleId, organizationId]);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "trips", label: `Trips (${trips.length})` },
    { key: "maintenance", label: "Maintenance" },
    { key: "costs", label: "Costs" },
  ];

  function fmt(n: unknown): string {
    return typeof n === "number" ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—";
  }

  return (
    <Card className="mb-6">
      <div className="border-b border-zinc-200">
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <CardContent className="pt-4">
        {activeTab === "overview" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-zinc-500 uppercase">Total km</div>
              <div className="text-xl font-bold">{fmt(tco?.totalMileageKm)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase">Uptime</div>
              <div className="text-xl font-bold">
                {tco?.monthsInService ? `${String(tco.monthsInService)}mo` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase">Total cost</div>
              <div className="text-xl font-bold">{fmt(tco?.totalCostOfOwnership)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase">EOL Score</div>
              {(() => {
                const score = eol?.eolScore;
                const band = eol?.eolBand as string | undefined;
                const bandVariant = band === "end-of-life" ? "destructive" : band === "monitor" ? "warning" : "success";
                const color = band === "end-of-life" ? "text-red-600" : band === "monitor" ? "text-amber-600" : "text-emerald-600";
                return (
                  <div className={`text-xl font-bold ${color}`}>
                    <span>{score != null ? String(score) : "—"}</span>
                    {band && <Badge variant={bandVariant as "destructive" | "warning" | "success"} className="ml-2 text-[10px]">{band}</Badge>}
                  </div>
                );
              })()}
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase">Work orders</div>
              <div className="text-xl font-bold">{fmt(tco?.workOrderCount)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase">Avg repair</div>
              <div className="text-xl font-bold">{tco?.avgRepairDays != null ? `${String(tco.avgRepairDays)}d` : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase">Cost / km</div>
              <div className="text-xl font-bold">{typeof tco?.costPerKm === "number" ? (tco.costPerKm as number).toFixed(2) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase">Repair / Value</div>
              <div className={`text-xl font-bold ${typeof tco?.repairToValueRatio === "number" && (tco.repairToValueRatio as number) > 0.5 ? "text-red-600" : ""}`}>
                {typeof tco?.repairToValueRatio === "number" ? `${((tco.repairToValueRatio as number) * 100).toFixed(1)}%` : "—"}
              </div>
            </div>
          </div>
        )}

        {activeTab === "trips" && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {trips.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">No trips recorded</p>
            ) : trips.map((t) => (
              <div key={String(t.id)} className="flex items-center justify-between text-sm border-b border-zinc-50 pb-2">
                <div>
                  <span className="font-medium">{String(t.departure_location)} → {String(t.destination)}</span>
                  <span className="text-zinc-500 ml-2">{String(t.driver_name)}</span>
                </div>
                <div className="text-right text-xs text-zinc-500">
                  {t.distance ? `${fmt(t.distance)} km` : "—"}
                  <span className="ml-2">{new Date(String(t.checkout_at)).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "maintenance" && (
          <div className="space-y-3">
            {maintenance.length === 0 && checks.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">No maintenance schedules or checks</p>
            ) : (
              <>
                {maintenance.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-zinc-500 uppercase mb-2">Scheduled Maintenance</div>
                    {maintenance.map((m) => {
                      const mStatus = String(m.status || "upcoming");
                      return (
                        <div key={String(m.id)} className="flex items-center justify-between text-sm border-b border-zinc-50 pb-2 mb-2">
                          <div>
                            <span className="font-medium capitalize">{String(m.maintenance_type).replace(/-/g, " ")}</span>
                            {m.next_due_date ? <span className="text-zinc-500 ml-2">Due: {String(m.next_due_date)}</span> : null}
                            {m.next_due_km ? <span className="text-zinc-500 ml-2">at {fmt(m.next_due_km)} km</span> : null}
                          </div>
                          <Badge variant={mStatus === "overdue" ? "destructive" : mStatus === "upcoming" ? "warning" : "success"}>
                            {mStatus}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
                {checks.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-zinc-500 uppercase mb-2">Recent Vehicle Checks</div>
                    {checks.map((c) => (
                      <div key={String(c.id)} className="flex items-center justify-between text-sm border-b border-zinc-50 pb-2 mb-2">
                        <div>
                          <span className="font-medium capitalize">{String(c.direction)} check</span>
                          <span className="text-zinc-500 ml-2">{String(c.driver_name)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={c.overall_pass ? "success" : "destructive"}>
                            {c.overall_pass ? "Pass" : "Fail"}
                          </Badge>
                          <span className="text-xs text-zinc-400">{String(c.check_date)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "costs" && (
          <div className="space-y-4">
            {tco ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="text-xs text-zinc-500">Purchase</div>
                    <div className="text-lg font-bold">{fmt(tco.purchasePrice)}</div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="text-xs text-zinc-500">Repairs</div>
                    <div className="text-lg font-bold">{fmt(tco.totalRepairCost)}</div>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="text-xs text-zinc-500">Insurance</div>
                    <div className="text-lg font-bold">{fmt(tco.totalInsurance)}</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <div className="text-xs text-blue-600">Total TCO</div>
                    <div className="text-lg font-bold text-blue-700">{fmt(tco.totalCostOfOwnership)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div>
                    <div className="text-zinc-500">Monthly burn</div>
                    <div className="font-semibold">{fmt(tco.monthlyBurnRate)}/mo</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Book value</div>
                    <div className="font-semibold">{fmt(tco.currentBookValue)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Downtime</div>
                    <div className="font-semibold">{fmt(tco.totalDowntimeDays)} days</div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-4">Loading cost data…</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
