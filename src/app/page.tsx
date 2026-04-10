"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VehicleStatusBadge, WorkOrderStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import type { VehicleStatus, WorkOrderStatus, WorkOrderPriority } from "@/types";
import { useAuth } from "@/lib/auth-context";

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

function KpiCard({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${color}`}>
          {value}{unit && <span className="text-sm font-normal ml-0.5">{unit}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
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
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/dashboard?org=${organizationId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [organizationId]);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-zinc-500">Loading dashboard…</div>;
  if (!data) return <div className="flex items-center justify-center h-64 text-red-500">Failed to load dashboard</div>;

  return (
    <div className="space-y-6">
      {/* Header + KPI row */}
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Fleet Overview</h2>
        <p className="text-sm text-zinc-500">Real-time fleet status, KPIs, and alerts</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Fleet Uptime"
          value={data.fleetUptimePct}
          unit="%"
          color={data.fleetUptimePct >= 70 ? "text-emerald-600" : data.fleetUptimePct >= 50 ? "text-amber-600" : "text-red-600"}
        />
        <KpiCard label="MTTR" value={data.avgRepairDays} unit="days" color="text-zinc-900" />
        <KpiCard label="MTBF" value={data.mtbfDays} unit="days" color="text-zinc-900" />
        <KpiCard label="Open WOs" value={data.openWorkOrders} color={data.openWorkOrders > 10 ? "text-red-600" : "text-zinc-900"} />
        <KpiCard label="Active Trips" value={data.activeTrips.length} color="text-blue-600" />
      </div>

      {/* Vehicle status grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total" value={data.totalVehicles} color="text-zinc-900" />
        <StatCard label="Operational" value={data.operational} color="text-emerald-600" />
        <StatCard label="Deployed" value={data.deployed} color="text-blue-600" />
        <StatCard label="Maint. HQ" value={data.maintenanceHq} color="text-amber-600" />
        <StatCard label="Maint. 3rd" value={data.maintenance3rd} color="text-amber-500" />
        <StatCard label="Awaiting Parts" value={data.awaitingParts} color="text-red-600" />
        <StatCard label="Grounded" value={data.grounded} color="text-red-800" />
      </div>

      {/* Alerts panel */}
      {data.alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Alerts ({data.alerts.length})</CardTitle>
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active trips */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Active Trips ({data.activeTrips.length})</CardTitle>
              <Link href="/trips" className="text-sm text-blue-600 hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.activeTrips.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">No active trips</p>
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
                        {trip.expected_return_at && <span> · Return: {new Date(trip.expected_return_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {trip.mission_priority === "high" && <Badge variant="destructive">High</Badge>}
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
              <CardTitle>Open Work Orders ({data.openWorkOrders})</CardTitle>
              <Link href="/work-orders" className="text-sm text-blue-600 hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.recentWorkOrders.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">No open work orders</p>
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
                      <div className={`text-sm font-bold ${wo.days_open > 7 ? "text-red-600" : wo.days_open > 3 ? "text-amber-600" : "text-zinc-600"}`}>
                        {wo.days_open}d
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity feed */}
      {data.recentActivity && data.recentActivity.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Activity (7 days)</CardTitle>
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
            <CardTitle>All Vehicles</CardTitle>
            <Link href="/vehicles" className="text-sm text-blue-600 hover:underline">Manage</Link>
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

  if (vehicles.length === 0) return <p className="text-sm text-zinc-500">Loading…</p>;

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
