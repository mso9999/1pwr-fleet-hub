"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VehicleStatusBadge, WorkOrderStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import type { VehicleStatus, WorkOrderStatus, WorkOrderPriority } from "@/types";
import { useAuth } from "@/lib/auth-context";

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
  activeTrips: Array<{
    id: string;
    vehicle_code: string;
    vehicle_make: string;
    vehicle_model: string;
    driver_name: string;
    departure_location: string;
    destination: string;
    checkout_at: string;
  }>;
  recentWorkOrders: Array<{
    id: string;
    vehicle_code: string;
    title: string;
    status: WorkOrderStatus;
    priority: WorkOrderPriority;
    assigned_to: string;
    downtime_start: string;
  }>;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }): React.ReactElement {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm font-medium text-zinc-500">{label}</div>
        <div className={`text-3xl font-bold mt-1 ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

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

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-zinc-500">Loading dashboard...</div>;
  }

  if (!data) {
    return <div className="flex items-center justify-center h-64 text-red-500">Failed to load dashboard</div>;
  }

  const uptimePercent = data.totalVehicles > 0
    ? Math.round(((data.operational + data.deployed) / (data.totalVehicles - data.writtenOff)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Fleet Overview</h2>
          <p className="text-sm text-zinc-500">Real-time fleet status and maintenance queue</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-zinc-500">Fleet Uptime</div>
          <div className={`text-3xl font-bold ${uptimePercent >= 70 ? "text-emerald-600" : uptimePercent >= 50 ? "text-amber-600" : "text-red-600"}`}>
            {uptimePercent}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total" value={data.totalVehicles} color="text-zinc-900" />
        <StatCard label="Operational" value={data.operational} color="text-emerald-600" />
        <StatCard label="Deployed" value={data.deployed} color="text-blue-600" />
        <StatCard label="Maint. HQ" value={data.maintenanceHq} color="text-amber-600" />
        <StatCard label="Maint. 3rd" value={data.maintenance3rd} color="text-amber-500" />
        <StatCard label="Awaiting Parts" value={data.awaitingParts} color="text-red-600" />
        <StatCard label="Grounded" value={data.grounded} color="text-red-800" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Active Trips</CardTitle>
              <Link href="/trips" className="text-sm text-blue-600 hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.activeTrips.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">No active trips</p>
            ) : (
              <div className="space-y-3">
                {data.activeTrips.map((trip) => (
                  <div key={trip.id} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                    <div>
                      <div className="font-medium text-sm">
                        <Badge variant="info" className="mr-2">{trip.vehicle_code}</Badge>
                        {trip.vehicle_make} {trip.vehicle_model}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {trip.departure_location} → {trip.destination}
                        {trip.driver_name && ` · ${trip.driver_name}`}
                      </div>
                    </div>
                    <div className="text-xs text-zinc-400">
                      {new Date(trip.checkout_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
              <div className="space-y-3">
                {data.recentWorkOrders.map((wo) => {
                  const daysDown = Math.ceil(
                    (Date.now() - new Date(wo.downtime_start).getTime()) / (1000 * 60 * 60 * 24)
                  );
                  return (
                    <div key={wo.id} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          <Badge variant="secondary">{wo.vehicle_code}</Badge>
                          {wo.title}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1 flex items-center gap-2">
                          <WorkOrderStatusBadge status={wo.status} />
                          <PriorityBadge priority={wo.priority} />
                          {wo.assigned_to && <span>· {wo.assigned_to}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${daysDown > 7 ? "text-red-600" : daysDown > 3 ? "text-amber-600" : "text-zinc-600"}`}>
                          {daysDown}d
                        </div>
                        <div className="text-xs text-zinc-400">down</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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

function VehicleQuickList(): React.ReactElement {
  const { organizationId } = useAuth();
  const [vehicles, setVehicles] = useState<Array<{
    id: string;
    code: string;
    make: string;
    model: string;
    status: VehicleStatus;
    current_location: string;
    asset_class: string;
  }>>([]);

  useEffect(() => {
    fetch(`/api/vehicles?org=${organizationId}`)
      .then((r) => r.json())
      .then(setVehicles)
      .catch(() => {});
  }, [organizationId]);

  if (vehicles.length === 0) return <p className="text-sm text-zinc-500">Loading...</p>;

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
