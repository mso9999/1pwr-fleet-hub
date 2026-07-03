"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VehicleStatusBadge, WorkOrderStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import type { VehicleStatus, WorkOrderStatus, WorkOrderPriority } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useLocaleContext } from "@/i18n/locale-context";
import { DashboardMetricHint } from "@/components/DashboardMetricHint";

interface Alert {
  type: string;
  severity: string;
  message: string;
  entityId?: string;
}

interface ActivityEvent {
  event_type: string;
  actor: string;
  vehicle_code: string;
  description: string;
  event_at: string;
}

interface DashboardData {
  totalVehicles: number;
  operational: number;
  deployed: number;
  maintenanceHq: number;
  maintenance3rd: number;
  awaitingParts: number;
  grounded: number;
  writtenOff: number;
  openWorkOrders: number;
  workOrderStatusCounts?: Array<{ status: string; count: number }>;
  avgRepairDays: number;
  fleetUptimePct: number;
  mtbfDays: number;
  activeTrips: Array<{
    id: string;
    vehicle_code: string;
    vehicle_make: string;
    vehicle_model: string;
    driver_name: string;
    destination: string;
    checkout_at: string;
    expected_return_at: string | null;
    mission_priority: string;
  }>;
  recentWorkOrders: Array<{
    id: string;
    vehicle_code: string;
    title: string;
    status: WorkOrderStatus;
    priority: WorkOrderPriority;
    assigned_to: string;
    days_open: number;
  }>;
  alerts: Alert[];
  recentActivity: ActivityEvent[];
}

function KpiCard({
  label,
  value,
  unit,
  color,
  hintKey,
}: {
  label: string;
  value: string | number;
  unit?: string;
  color: string;
  hintKey?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        {hintKey ? (
          <DashboardMetricHint hintKey={hintKey}>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</div>
          </DashboardMetricHint>
        ) : (
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</div>
        )}
        <div className={`text-2xl font-bold mt-1 ${color}`}>
          {value}{unit && <span className="text-sm font-normal ml-0.5">{unit}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  color,
  hintKey,
}: {
  label: string;
  value: number;
  color: string;
  hintKey?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        {hintKey ? (
          <DashboardMetricHint hintKey={hintKey} align="center">
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </DashboardMetricHint>
        ) : (
          <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
        )}
      </CardContent>
    </Card>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "border-red-200 bg-red-50 text-red-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-blue-200 bg-blue-50 text-blue-800",
};

const EVENT_ICONS: Record<string, string> = {
  trip_checkout: "→",
  wo_created: "🔧",
  inspection: "📋",
  vehicle_check: "🛡",
};

export default function DashboardPage(): React.ReactElement {
  const { organizationId } = useAuth();
  const { t } = useLocaleContext();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/dashboard?org=${organizationId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [organizationId]);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-zinc-500">{t("common.loadingDashboard")}</div>;
  if (!data) return <div className="flex items-center justify-center h-64 text-red-500">{t("common.failedDashboard")}</div>;

  return (
    <div className="space-y-6">
      {/* Header + KPI row */}
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">{t("dashboard.fleetOverview")}</h2>
        <p className="text-sm text-zinc-500">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-tutorial="tutorial-dashboard-kpis">
        <KpiCard
          label={t("dashboard.fleetUptime")}
          value={data.fleetUptimePct}
          unit="%"
          color={data.fleetUptimePct >= 70 ? "text-emerald-600" : data.fleetUptimePct >= 50 ? "text-amber-600" : "text-red-600"}
          hintKey="fleetUptime"
        />
        <KpiCard
          label={t("dashboard.mttr")}
          value={data.avgRepairDays}
          unit={t("dashboard.daysUnit")}
          color="text-zinc-900"
          hintKey="mttr"
        />
        <KpiCard
          label={t("dashboard.mtbf")}
          value={data.mtbfDays}
          unit={t("dashboard.daysUnit")}
          color="text-zinc-900"
          hintKey="mtbf"
        />
        <KpiCard
          label={t("dashboard.openWOs")}
          value={data.openWorkOrders}
          color={data.openWorkOrders > 10 ? "text-red-600" : "text-zinc-900"}
          hintKey="openWOs"
        />
        <KpiCard
          label={t("dashboard.activeTrips")}
          value={data.activeTrips.length}
          color="text-blue-600"
          hintKey="activeTrips"
        />
      </div>

      {/* Vehicle status grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-tutorial="tutorial-dashboard-status">
        <StatCard label={t("dashboard.total")} value={data.totalVehicles} color="text-zinc-900" />
        <StatCard label={t("dashboard.operational")} value={data.operational} color="text-emerald-600" />
        <StatCard label={t("dashboard.deployed")} value={data.deployed} color="text-blue-600" />
        <StatCard label={t("dashboard.maintHq")} value={data.maintenanceHq} color="text-amber-600" hintKey="maintHq" />
        <StatCard label={t("dashboard.maint3rd")} value={data.maintenance3rd} color="text-amber-500" hintKey="maint3rd" />
        <StatCard label={t("dashboard.awaitingParts")} value={data.awaitingParts} color="text-red-600" />
        <StatCard label={t("dashboard.grounded")} value={data.grounded} color="text-red-800" />
      </div>

      {/* Alerts panel */}
      {data.alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t("dashboard.alerts")} ({data.alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.alerts.map((alert, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.low}`}>
                {alert.message}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2" data-tutorial="tutorial-dashboard-panels">
        {/* Active trips */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>
                {t("dashboard.activeTripsTitle")} ({data.activeTrips.length})
              </CardTitle>
              <Link href="/trips" className="text-sm text-blue-600 hover:underline">{t("dashboard.viewAll")}</Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.activeTrips.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">{t("dashboard.noActiveTrips")}</p>
            ) : (
              <div className="space-y-2">
                {data.activeTrips.map((trip) => (
                  <div key={trip.id} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                    <div>
                      <div className="font-medium text-sm">
                        <Badge variant="info" className="mr-2">{trip.vehicle_code}</Badge>
                        → {trip.destination}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {trip.driver_name} · {new Date(trip.checkout_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {trip.expected_return_at && (
                          <span>
                            {" "}
                            · {t("dashboard.returnLabel")}: {new Date(trip.expected_return_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {trip.mission_priority === "high" && <Badge variant="destructive">{t("dashboard.high")}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open work orders */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>
                {t("dashboard.openWorkOrdersTitle")} ({data.openWorkOrders})
              </CardTitle>
              <Link href="/work-orders" className="text-sm text-blue-600 hover:underline">{t("dashboard.viewAll")}</Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.recentWorkOrders.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">{t("dashboard.noOpenWorkOrders")}</p>
            ) : (
              <div className="space-y-2">
                {data.recentWorkOrders.map((wo) => (
                  <div key={wo.id} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm flex items-center gap-2">
                        <Badge variant="secondary">{wo.vehicle_code}</Badge>
                        <span className="truncate">{wo.title}</span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                        <WorkOrderStatusBadge status={wo.status} />
                        <PriorityBadge priority={wo.priority} />
                        {wo.assigned_to && <span>· {wo.assigned_to}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      {(() => {
                        const d = Number(wo.days_open);
                        const ok = Number.isFinite(d);
                        return (
                          <div
                            className={`text-sm font-bold ${
                              ok && d > 7 ? "text-red-600" : ok && d > 3 ? "text-amber-600" : "text-zinc-600"
                            }`}
                          >
                            {ok ? (
                              <>
                                {d}
                                {t("dashboard.daysShort")}
                              </>
                            ) : (
                              "—"
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data.workOrderStatusCounts && data.workOrderStatusCounts.length > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-100">
                <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Pipeline by status</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.workOrderStatusCounts.map((s) => (
                    <Link
                      key={s.status}
                      href={`/work-orders?status=${encodeURIComponent(s.status)}`}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs hover:border-blue-300 hover:bg-blue-50"
                    >
                      <span className="capitalize text-zinc-700">{s.status.replace(/-/g, " ")}</span>
                      <span className="font-semibold text-zinc-900">{s.count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity feed */}
      {data.recentActivity && data.recentActivity.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("dashboard.recentActivity")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {data.recentActivity.map((evt, i) => (
                <div key={i} className="flex items-start gap-2 text-sm py-1.5 border-b border-zinc-50 last:border-0">
                  <span className="shrink-0 w-5 text-center">{EVENT_ICONS[evt.event_type] || "•"}</span>
                  <div className="min-w-0">
                    <span className="font-medium">{evt.vehicle_code}</span>
                    <span className="text-zinc-500 ml-1">{evt.description}</span>
                    {evt.actor && <span className="text-zinc-400 ml-1">— {evt.actor}</span>}
                  </div>
                  <span className="text-xs text-zinc-400 shrink-0 ml-auto">
                    {new Date(evt.event_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vehicle status board */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>{t("dashboard.allVehicles")}</CardTitle>
            <Link href="/vehicles" className="text-sm text-blue-600 hover:underline">{t("dashboard.manage")}</Link>
          </div>
        </CardHeader>
        <CardContent>
          <VehicleQuickList />
        </CardContent>
      </Card>
    </div>
  );
}

function VehicleQuickList() {
  const { organizationId } = useAuth();
  const { t } = useLocaleContext();
  const [vehicles, setVehicles] = useState<Array<{
    id: string;
    code: string;
    make: string;
    model: string;
    status: VehicleStatus;
    current_location: string;
  }>>([]);

  useEffect(() => {
    fetch(`/api/vehicles?org=${organizationId}`)
      .then((r) => r.json())
      .then(setVehicles)
      .catch(() => {});
  }, [organizationId]);

  if (vehicles.length === 0) return <p className="text-sm text-zinc-500">{t("common.loadingEllipsis")}</p>;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {vehicles.map((v) => (
        <Link
          key={v.id}
          href={`/vehicles/${v.id}`}
          className="flex flex-col items-center gap-1.5 rounded-lg border border-zinc-100 bg-white p-3 text-center hover:border-blue-200 hover:bg-blue-50/50 transition-colors"
        >
          <div className="text-lg font-bold text-zinc-900">{v.code}</div>
          <div className="text-xs text-zinc-500 truncate w-full">{v.make} {v.model}</div>
          <VehicleStatusBadge status={v.status} />
          <div className="text-xs text-zinc-400">{v.current_location}</div>
        </Link>
      ))}
    </div>
  );
}
