"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { useTutorial } from "@/components/tutorial/tutorial-context";
import { ASSET_CLASS, ASSET_CLASS_LABELS, type AssetClass } from "@/types";
import { lPer100kmToUsMpg } from "@/lib/vehicle-fuel-lookup";
import { cn } from "@/lib/utils";

interface RequestRow {
  id: string;
  requested_by_id: string;
  requested_by_name: string;
  requested_for: string;
  purpose: string;
  destination: string;
  departure_date: string;
  return_date: string;
  passengers: string;
  required_vehicle_class: string;
  loadout_description: string;
  priority: string;
  status: string;
  approved_by_name: string;
  rejection_reason: string;
  assigned_vehicle_id: string | null;
  assigned_vehicle_code: string | null;
  assigned_vehicle_make: string | null;
  assigned_vehicle_model: string | null;
  notes: string;
  created_at: string;
  estimated_route_km?: number | null;
  estimated_fuel_liters?: number | null;
  fuel_efficiency_l_per_100km?: number | null;
}

interface PoolVehicle {
  id: string;
  code: string;
  make: string;
  model: string;
  pool: string;
  current_location: string;
  /** Present when API returns full vehicle row (operational vs deployed). */
  status?: string;
}

interface PoolData {
  pools: Record<string, PoolVehicle[]>;
  availableCount: number;
  statusCounts: Record<string, number>;
  pendingRequests: RequestRow[];
}

const STATUS_COLORS: Record<string, string> = {
  requested: "warning",
  approved: "success",
  assigned: "success",
  rejected: "destructive",
  completed: "secondary",
  cancelled: "secondary",
};

/** Workflow order aligned with typical PR-style vehicle request tracking */
const STATUS_PIPELINE: { status: string; label: string }[] = [
  { status: "requested", label: "Pending approval" },
  { status: "approved", label: "Approved" },
  { status: "assigned", label: "Assigned" },
  { status: "completed", label: "Completed" },
  { status: "rejected", label: "Rejected" },
  { status: "cancelled", label: "Cancelled" },
];

const COLUMN_HEADER_BG: Record<string, string> = {
  requested: "bg-amber-50/90 border-amber-100",
  approved: "bg-emerald-50/90 border-emerald-100",
  assigned: "bg-green-50/90 border-green-100",
  completed: "bg-zinc-100/90 border-zinc-200",
  rejected: "bg-red-50/90 border-red-100",
  cancelled: "bg-slate-100/90 border-slate-200",
};

const PIPELINE_STATUS_SET = new Set(STATUS_PIPELINE.map((p) => p.status));

function groupRequestsByStatus(requests: RequestRow[]): {
  byStatus: Map<string, RequestRow[]>;
  other: RequestRow[];
} {
  const byStatus = new Map<string, RequestRow[]>();
  for (const p of STATUS_PIPELINE) {
    byStatus.set(p.status, []);
  }
  const other: RequestRow[] = [];
  for (const r of requests) {
    const bucket = byStatus.get(r.status);
    if (bucket) bucket.push(r);
    else other.push(r);
  }
  for (const arr of byStatus.values()) {
    arr.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
  other.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return { byStatus, other };
}

interface RefRow {
  code: string;
  label: string;
  active: number;
}

export default function VehicleRequestsPage() {
  const { organizationId, user } = useAuth();
  const { active, trackId, stepIndex } = useTutorial();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [pool, setPool] = useState<PoolData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"requests" | "pool">("requests");
  const [requestsLayout, setRequestsLayout] = useState<"board" | "list">("board");
  const [listStatusFilter, setListStatusFilter] = useState<string | null>(null);

  const isManager = user && (user.role === "fleet_lead" || user.role === "manager" || user.role === "admin");

  const { byStatus, other } = groupRequestsByStatus(requests);
  const statusCounts = STATUS_PIPELINE.map((p) => ({
    ...p,
    count: byStatus.get(p.status)?.length ?? 0,
  }));
  const otherCount = other.length;

  const filteredListRequests =
    listStatusFilter === null
      ? requests
      : listStatusFilter === "__other__"
        ? requests.filter((r) => !PIPELINE_STATUS_SET.has(r.status))
        : requests.filter((r) => r.status === listStatusFilter);
  const sortedListRequests = [...filteredListRequests].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const loadData = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    Promise.all([
      fetch(`/api/vehicle-requests?org=${organizationId}`).then(async (r) => {
        const j: unknown = await r.json();
        return { ok: r.ok, j };
      }),
      fetch(`/api/vehicle-requests/pool?org=${organizationId}`).then(async (r) => {
        const j: unknown = await r.json();
        return { ok: r.ok, j };
      }),
    ])
      .then(([{ ok: okReq, j: reqsRaw }, { ok: okPool, j: poolRaw }]) => {
        setRequests(Array.isArray(reqsRaw) ? reqsRaw : []);
        const poolOk =
          okPool &&
          poolRaw &&
          typeof poolRaw === "object" &&
          poolRaw !== null &&
          "pools" in poolRaw;
        setPool(poolOk ? (poolRaw as PoolData) : null);
        if (!okReq || !okPool) {
          const e1 =
            !okReq && reqsRaw && typeof reqsRaw === "object" && "error" in reqsRaw
              ? String((reqsRaw as { error: string }).error)
              : null;
          const e2 =
            !okPool && poolRaw && typeof poolRaw === "object" && "error" in poolRaw
              ? String((poolRaw as { error: string }).error)
              : null;
          setLoadError([e1, e2].filter(Boolean).join(" · ") || "Could not load data");
        }
        setIsLoading(false);
      })
      .catch(() => {
        setRequests([]);
        setPool(null);
        setLoadError("Network error");
        setIsLoading(false);
      });
  }, [organizationId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!active || trackId !== "vehicleRequest") return;
    if (stepIndex >= 4) {
      setShowForm(false);
      setView("pool");
    } else if (stepIndex >= 2) {
      setShowForm(true);
      setView("requests");
    } else {
      setShowForm(false);
      setView("requests");
    }
  }, [active, trackId, stepIndex]);

  const pendingCount = (Array.isArray(requests) ? requests : []).filter((r) => r.status === "requested").length;

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong className="font-semibold">Could not load vehicle requests.</strong> {loadError}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            {requests.length} request{requests.length !== 1 ? "s" : ""}
            {pendingCount > 0 && <span className="text-amber-600 font-semibold"> · {pendingCount} pending approval</span>}
            {pool && <span> · {pool.availableCount} in vehicle pool</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div
            className="flex rounded-lg border border-zinc-200 overflow-hidden"
            data-tutorial="tutorial-vr-pool-toggle"
          >
            <button
              type="button"
              onClick={() => setView("requests")}
              className={`px-4 py-2 text-sm font-medium ${view === "requests" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
            >
              Requests
            </button>
            <button
              type="button"
              onClick={() => setView("pool")}
              className={`px-4 py-2 text-sm font-medium border-l border-zinc-200 ${view === "pool" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
            >
              Vehicle Pool
            </button>
          </div>
          {view === "requests" && (
            <div
              className="flex rounded-lg border border-zinc-200 overflow-hidden"
              role="group"
              aria-label="Request layout"
            >
              <button
                type="button"
                onClick={() => { setRequestsLayout("board"); setListStatusFilter(null); }}
                className={`px-3 py-2 text-sm font-medium ${requestsLayout === "board" ? "bg-zinc-800 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
              >
                Status board
              </button>
              <button
                type="button"
                onClick={() => setRequestsLayout("list")}
                className={`px-3 py-2 text-sm font-medium border-l border-zinc-200 ${requestsLayout === "list" ? "bg-zinc-800 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
              >
                List
              </button>
            </div>
          )}
          <span data-tutorial="tutorial-vr-request-btn">
            <Button onClick={() => { setShowForm(!showForm); setView("requests"); }} size="lg" className="touch-manipulation min-h-[48px]">
              + Request vehicle
            </Button>
          </span>
        </div>
      </div>

      {showForm && (
        <RequestForm
          organizationId={organizationId}
          userId={user?.id || ""}
          userName={user?.name || ""}
          onComplete={() => { setShowForm(false); loadData(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <div className="text-zinc-500 text-center py-12">Loading…</div>
      ) : view === "pool" ? (
        pool ? (
          <PoolView pool={pool} />
        ) : (
          <div className="text-zinc-500 text-center py-12">
            {loadError
              ? "Vehicle pool could not be loaded. See the message above."
              : "Vehicle pool is unavailable."}
          </div>
        )
      ) : requests.length === 0 ? (
        <div className="text-zinc-500 text-center py-12">No vehicle requests yet.</div>
      ) : requestsLayout === "board" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Pipeline</p>
            <div className="flex flex-wrap gap-2">
              {statusCounts.map(({ status, label, count }) => (
                <button
                  key={status}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-1.5 text-left text-sm hover:bg-zinc-100 touch-manipulation"
                  onClick={() => {
                    document.getElementById(`vr-col-${status}`)?.scrollIntoView({
                      behavior: "smooth",
                      inline: "center",
                      block: "nearest",
                    });
                  }}
                >
                  <span className="text-zinc-600">{label}</span>
                  <span className="tabular-nums font-bold text-zinc-900">{count}</span>
                </button>
              ))}
              {otherCount > 0 && (
                <span className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm">
                  <span className="text-zinc-700">Other status</span>
                  <span className="tabular-nums font-bold">{otherCount}</span>
                </span>
              )}
            </div>
          </div>

          <div
            className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0"
            role="region"
            aria-label="Vehicle request status columns"
          >
            <div className="flex gap-3 min-w-full md:min-w-0">
              {STATUS_PIPELINE.map(({ status, label }) => {
                const col = byStatus.get(status) ?? [];
                const headBg = COLUMN_HEADER_BG[status] ?? "bg-zinc-50 border-zinc-200";
                return (
                  <div
                    key={status}
                    id={`vr-col-${status}`}
                    className="flex w-[min(100vw-2rem,300px)] shrink-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/40 md:flex-1 md:min-w-0 md:w-auto"
                  >
                    <div
                      className={cn(
                        "rounded-t-xl border-b px-3 py-2",
                        headBg
                      )}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                        {label}
                      </div>
                      <div className="text-xl font-bold tabular-nums text-zinc-900">{col.length}</div>
                    </div>
                    <div className="flex max-h-[min(70vh,720px)] flex-col gap-2 overflow-y-auto p-2">
                      {col.length === 0 ? (
                        <p className="py-6 text-center text-xs text-zinc-400">No requests</p>
                      ) : (
                        col.map((req) => (
                          <RequestCard
                            key={req.id}
                            request={req}
                            isManager={!!isManager}
                            pool={pool}
                            organizationId={organizationId}
                            approverName={user?.name || ""}
                            onUpdated={loadData}
                            compact
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
              {other.length > 0 && (
                <div className="flex w-[min(100vw-2rem,300px)] shrink-0 flex-col rounded-xl border border-amber-200 bg-amber-50/30 md:flex-1 md:min-w-0">
                  <div className="rounded-t-xl border-b border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                      Other
                    </div>
                    <div className="text-xl font-bold tabular-nums text-zinc-900">{other.length}</div>
                  </div>
                  <div className="flex max-h-[min(70vh,720px)] flex-col gap-2 overflow-y-auto p-2">
                    {other.map((req) => (
                      <RequestCard
                        key={req.id}
                        request={req}
                        isManager={!!isManager}
                        pool={pool}
                        organizationId={organizationId}
                        approverName={user?.name || ""}
                        onUpdated={loadData}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-zinc-500 mr-1">Filter:</span>
            <button
              type="button"
              onClick={() => setListStatusFilter(null)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium touch-manipulation",
                listStatusFilter === null
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              )}
            >
              All ({requests.length})
            </button>
            {STATUS_PIPELINE.map(({ status, label }) => {
              const n = byStatus.get(status)?.length ?? 0;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setListStatusFilter((prev) => (prev === status ? null : status))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium touch-manipulation",
                    listStatusFilter === status
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                  )}
                >
                  {label} ({n})
                </button>
              );
            })}
            {otherCount > 0 && (
              <button
                type="button"
                onClick={() => setListStatusFilter((prev) => (prev === "__other__" ? null : "__other__"))}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium touch-manipulation",
                  listStatusFilter === "__other__"
                    ? "border-amber-700 bg-amber-700 text-white"
                    : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                )}
              >
                Other ({otherCount})
              </button>
            )}
          </div>
          {sortedListRequests.length === 0 ? (
            <div className="text-zinc-500 text-center py-12">No requests in this status.</div>
          ) : (
            <div className="space-y-3">
              {sortedListRequests.map((req) => (
                <RequestCard
                  key={req.id}
                  request={req}
                  isManager={!!isManager}
                  pool={pool}
                  organizationId={organizationId}
                  approverName={user?.name || ""}
                  onUpdated={loadData}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RequestCard({
  request: r,
  isManager,
  pool,
  organizationId,
  approverName,
  onUpdated,
  compact,
}: {
  request: RequestRow;
  isManager: boolean;
  pool: PoolData | null;
  organizationId: string;
  approverName: string;
  onUpdated: () => void;
  compact?: boolean;
}) {
  const [isActing, setIsActing] = useState(false);
  const [assignVehicleId, setAssignVehicleId] = useState("");

  async function updateStatus(status: string, extra?: Record<string, string>) {
    setIsActing(true);
    await fetch(`/api/vehicle-requests/${r.id}`, {
      method: "PATCH",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ status, approvedByName: approverName, ...extra }),
    });
    setIsActing(false);
    onUpdated();
  }

  async function assignVehicle() {
    if (!assignVehicleId) return;
    setIsActing(true);
    await fetch(`/api/vehicle-requests/${r.id}/assign`, {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ vehicleId: assignVehicleId, approvedByName: approverName }),
    });
    setIsActing(false);
    onUpdated();
  }

  // Assign API only accepts operational vehicles; pool view also lists deployed for visibility.
  const availableVehicles = pool?.pools
    ? Object.values(pool.pools)
        .flat()
        .filter((v) => !v.status || v.status === "operational")
    : [];

  return (
    <Card
      className={cn(
        r.status === "requested" ? "border-amber-200" : "",
        compact ? "shadow-sm" : ""
      )}
    >
      <div className={cn(compact ? "p-3 space-y-2" : "p-4 space-y-3")}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className={cn("font-medium", compact && "text-sm line-clamp-2")}>
              {r.purpose || "Vehicle request"}
            </div>
            <div className={cn("text-xs text-zinc-500 mt-0.5", compact && "line-clamp-1")}>
              By {r.requested_by_name}{r.requested_for ? ` for ${r.requested_for}` : ""} · {new Date(r.created_at).toLocaleString()}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {r.priority === "high" && <Badge variant="destructive">High</Badge>}
            <Badge variant={(STATUS_COLORS[r.status] || "secondary") as "warning" | "success" | "destructive" | "secondary"}>
              {r.status}
            </Badge>
          </div>
        </div>

        <div
          className={cn(
            "grid gap-2 text-xs text-zinc-600",
            compact ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4"
          )}
        >
          {r.destination && <div>Destination: <strong>{r.destination}</strong></div>}
          {r.departure_date && <div>Depart: <strong>{r.departure_date}</strong></div>}
          {!compact && r.return_date && <div>Return: <strong>{r.return_date}</strong></div>}
          {!compact && r.required_vehicle_class && <div>Class: <strong>{r.required_vehicle_class}</strong></div>}
          {!compact && r.passengers && <div>Passengers: <strong>{r.passengers}</strong></div>}
        </div>

        {(r.estimated_route_km != null && r.estimated_route_km > 0) && !compact && (
          <div className="text-xs text-zinc-700 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 space-y-0.5">
            <div>
              Est. driving distance: <strong>{Math.round(r.estimated_route_km * 10) / 10} km</strong>
              <span className="text-zinc-500"> (one-way, mapped route)</span>
            </div>
            {r.estimated_fuel_liters != null && r.estimated_fuel_liters > 0 && r.fuel_efficiency_l_per_100km != null ? (
              <div>
                Est. fuel (one-way): <strong>{r.estimated_fuel_liters} L</strong>
                {" · "}
                <span className="text-zinc-600">
                  ~{lPer100kmToUsMpg(r.fuel_efficiency_l_per_100km)} US MPG combined (
                  {r.fuel_efficiency_l_per_100km} L/100 km)
                </span>
              </div>
            ) : (
              <div className="text-amber-800/90">Fuel estimate appears after a vehicle is assigned.</div>
            )}
          </div>
        )}

        {compact && (r.estimated_route_km != null && r.estimated_route_km > 0) && (
          <div className="text-[11px] text-zinc-600">
            ~{Math.round(r.estimated_route_km * 10) / 10} km
            {r.estimated_fuel_liters != null && r.estimated_fuel_liters > 0 ? (
              <span> · ~{r.estimated_fuel_liters} L</span>
            ) : null}
          </div>
        )}

        {r.assigned_vehicle_code && (
          <div className={cn("text-emerald-700 font-medium", compact ? "text-xs" : "text-sm")}>
            Assigned: {r.assigned_vehicle_code} — {r.assigned_vehicle_make} {r.assigned_vehicle_model}
          </div>
        )}

        {r.rejection_reason && (
          <div className={cn("text-red-700", compact ? "text-xs line-clamp-2" : "text-sm")}>
            Rejected: {r.rejection_reason}
          </div>
        )}

        {isManager && r.status === "requested" && (
          <div className={cn("flex flex-wrap gap-2 border-t border-zinc-100", compact ? "pt-1.5" : "pt-2")}>
            <Button size="sm" disabled={isActing} onClick={() => void updateStatus("approved")} className="bg-emerald-600 hover:bg-emerald-700 text-white touch-manipulation">
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={isActing} onClick={() => {
              const reason = window.prompt("Rejection reason:");
              if (reason) void updateStatus("rejected", { rejectionReason: reason });
            }} className="text-red-600 border-red-200 touch-manipulation">
              Reject
            </Button>
          </div>
        )}

        {isManager && (r.status === "approved" || r.status === "requested") && !r.assigned_vehicle_id && (
          <div className={cn("flex flex-col gap-2 border-t border-zinc-100 sm:flex-row sm:flex-wrap sm:items-end", compact ? "pt-1.5" : "pt-2")}>
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-zinc-600 block mb-1">Assign vehicle</label>
              <select
                value={assignVehicleId}
                onChange={(e) => setAssignVehicleId(e.target.value)}
                className={cn(
                  "w-full rounded-lg border border-zinc-200 px-2 text-sm",
                  compact ? "h-9" : "h-10"
                )}
              >
                <option value="">Select available vehicle…</option>
                {availableVehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.code} — {v.make} {v.model} ({v.pool})</option>
                ))}
              </select>
            </div>
            <Button size="sm" disabled={!assignVehicleId || isActing} onClick={() => void assignVehicle()} className="touch-manipulation">
              Assign
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function PoolView({ pool }: { pool: PoolData }) {
  const totalInPools = Object.values(pool.pools).reduce((n, list) => n + list.length, 0);

  return (
    <div className="space-y-6">
      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(pool.statusCounts).map(([status, count]) => (
          <Card key={status}>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs text-zinc-500 capitalize">{status.replace(/-/g, " ")}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {totalInPools === 0 && (
        <p className="text-sm text-zinc-600 text-center py-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4">
          No operational or deployed vehicles in this organization’s pool. Other statuses (maintenance, awaiting parts, etc.)
          are excluded here — adjust vehicle status on the vehicle record if needed.
        </p>
      )}

      {/* Pool groups */}
      {Object.entries(pool.pools).map(([poolName, vehicles]) => (
        <Card key={poolName}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base capitalize">{poolName} pool ({vehicles.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2">
                  <div className="min-w-0">
                    <span className="font-bold text-sm">{v.code}</span>
                    <span className="text-xs text-zinc-500 ml-2">{v.make} {v.model}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {v.status === "deployed" && (
                      <Badge variant="secondary" className="text-[10px]">Deployed</Badge>
                    )}
                    <Badge variant="success" className="text-[10px]">{v.current_location}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Pending requests */}
      {pool.pendingRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending requests ({pool.pendingRequests.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pool.pendingRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b border-zinc-50 pb-2">
                  <div>
                    <span className="font-medium">{(r as unknown as RequestRow).requested_by_name}</span>
                    <span className="text-zinc-500 ml-2">{r.destination} · {r.departure_date}</span>
                  </div>
                  <Badge variant={(STATUS_COLORS[r.status] || "secondary") as "warning" | "success" | "destructive" | "secondary"}>
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RequestForm({
  organizationId,
  userId,
  userName,
  onComplete,
  onCancel,
}: {
  organizationId: string;
  userId: string;
  userName: string;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [sites, setSites] = useState<RefRow[]>([]);
  const [departments, setDepartments] = useState<RefRow[]>([]);
  const [destinationChoice, setDestinationChoice] = useState("");
  const [destinationOther, setDestinationOther] = useState("");
  const [requestedForChoice, setRequestedForChoice] = useState("");
  const [requestedForOther, setRequestedForOther] = useState("");
  const [routeEstimateLoading, setRouteEstimateLoading] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState<{
    ok: boolean;
    message?: string | null;
    distanceKm: number | null;
    fuelLiters: number | null;
    lPer100km: number | null;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/reference-data?org=${organizationId}&type=site`).then((r) => r.json()),
      fetch(`/api/reference-data?org=${organizationId}&type=department`).then((r) => r.json()),
    ])
      .then(([s, d]) => {
        setSites(((s || []) as RefRow[]).filter((row) => row.active));
        setDepartments(((d || []) as RefRow[]).filter((row) => row.active));
      })
      .catch(() => {
        setSites([]);
        setDepartments([]);
      });
  }, [organizationId]);

  useEffect(() => {
    if (!destinationChoice || destinationChoice === "__write__") {
      setRouteEstimate(null);
      setRouteEstimateLoading(false);
      return;
    }
    let cancelled = false;
    setRouteEstimateLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/vehicle-requests/estimate", {
          method: "POST",
          headers: await jsonHeadersWithBearer(),
          body: JSON.stringify({
            organizationId,
            destinationSiteCode: destinationChoice,
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          message?: string | null;
          distanceKm: number | null;
          fuelLiters: number | null;
          lPer100km: number | null;
        };
        if (!cancelled) {
          setRouteEstimate(data);
          setRouteEstimateLoading(false);
        }
      } catch {
        if (!cancelled) {
          setRouteEstimate(null);
          setRouteEstimateLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [destinationChoice, organizationId]);

  const siteRows = sites.filter((s) => s.code !== "OTHER");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    let destination = "";
    if (destinationChoice === "__write__") {
      destination = destinationOther.trim();
      if (!destination) {
        setFormError("Enter a destination or choose a site.");
        return;
      }
    } else if (destinationChoice) {
      destination = destinationChoice;
    } else {
      setFormError("Choose a destination.");
      return;
    }

    let requestedFor = "";
    if (requestedForChoice === "__other__") {
      requestedFor = requestedForOther.trim();
      if (!requestedFor) {
        setFormError("Enter a team or person, or pick a different option.");
        return;
      }
    } else if (requestedForChoice) {
      const dept = departments.find((d) => d.code === requestedForChoice);
      requestedFor = dept ? dept.label : requestedForChoice;
    }

    const fd = new FormData(e.currentTarget);

    setIsSubmitting(true);
    const res = await fetch("/api/vehicle-requests", {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({
        organizationId,
        requestedById: userId,
        requestedByName: userName,
        requestedFor,
        purpose: fd.get("purpose") || "",
        destination,
        departureDate: fd.get("departureDate") || "",
        returnDate: fd.get("returnDate") || "",
        passengers: fd.get("passengers") || "",
        requiredVehicleClass: fd.get("requiredVehicleClass") || "",
        loadoutDescription: fd.get("loadoutDescription") || "",
        priority: fd.get("priority") || "normal",
        notes: fd.get("notes") || "",
      }),
    });
    setIsSubmitting(false);
    if (res.ok) onComplete();
    else {
      const err = await res.json().catch(() => ({}));
      setFormError(err.error || "Failed to submit request.");
    }
  }

  return (
    <Card className="border-emerald-200" data-tutorial="tutorial-vr-form">
      <CardHeader><CardTitle>Request a Vehicle</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input name="purpose" label="Purpose *" required placeholder="e.g. Site delivery to MAK" />
            <div className="flex flex-col gap-1.5 sm:col-span-1">
              <label className="text-sm font-medium text-zinc-700">Destination *</label>
              <select
                required
                value={destinationChoice}
                onChange={(e) => setDestinationChoice(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              >
                <option value="">Select site or other…</option>
                {siteRows.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.label}
                  </option>
                ))}
                <option value="__write__">Other (type site / location)…</option>
              </select>
              {destinationChoice === "__write__" && (
                <Input
                  label=""
                  value={destinationOther}
                  onChange={(e) => setDestinationOther(e.target.value)}
                  placeholder="Site code or location"
                  aria-label="Destination (other)"
                />
              )}
              <div className="space-y-2" data-tutorial="tutorial-vr-route-estimate">
                <p className="text-xs text-zinc-500">
                  Pick a site from the list for a mapped one-way distance; fuel (L) and MPG appear on the request after a
                  vehicle is assigned.
                </p>
                {destinationChoice && destinationChoice !== "__write__" && (
                  <div className="rounded-md border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-xs text-zinc-700">
                    {routeEstimateLoading && <span className="text-zinc-500">Calculating driving distance…</span>}
                    {!routeEstimateLoading && routeEstimate?.ok && routeEstimate.distanceKm != null && (
                      <span>
                        Est. one-way drive:{" "}
                        <strong>{Math.round(routeEstimate.distanceKm * 10) / 10} km</strong>
                        {routeEstimate.message ? (
                          <span className="block text-zinc-500 mt-1">{routeEstimate.message}</span>
                        ) : null}
                      </span>
                    )}
                    {!routeEstimateLoading && routeEstimate && !routeEstimate.ok && (
                      <span className="text-amber-900">{routeEstimate.message || "Could not estimate route."}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-1">
              <label className="text-sm font-medium text-zinc-700">Requested for</label>
              <p className="text-xs text-zinc-500 -mt-1 mb-0">Team or person (if not yourself)</p>
              <select
                value={requestedForChoice}
                onChange={(e) => setRequestedForChoice(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              >
                <option value="">Myself / same as requester</option>
                {departments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
                <option value="__other__">Other (team or person)…</option>
              </select>
              {requestedForChoice === "__other__" && (
                <Input
                  label=""
                  value={requestedForOther}
                  onChange={(e) => setRequestedForOther(e.target.value)}
                  placeholder="Team or person name"
                  aria-label="Requested for (other)"
                />
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input name="departureDate" label="Departure date *" type="date" required />
            <Input name="returnDate" label="Return date" type="date" />
            <Input name="passengers" label="Passengers" placeholder="Number or names" />
            <Select name="priority" label="Priority">
              <option value="normal">Normal</option>
              <option value="low">Low</option>
              <option value="high">High</option>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select name="requiredVehicleClass" label="Vehicle class needed">
              <option value="">Any</option>
              {(Object.values(ASSET_CLASS) as AssetClass[]).map((c) => (
                <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>
              ))}
            </Select>
            <Input name="loadoutDescription" label="Loadout / equipment" placeholder="What will you be carrying?" />
          </div>
          <Input name="notes" label="Notes" placeholder="Additional information" />
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div>
          )}
          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting} size="lg" className="min-h-[48px] touch-manipulation">
              {isSubmitting ? "Submitting…" : "Submit request"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} size="lg" className="min-h-[48px]">Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
