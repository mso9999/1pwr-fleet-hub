"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
  /** Rest & recuperation / travel policy — na | pending | approved */
  rr_status?: string;
  /** Joined from users.email for requestor permission checks */
  requested_by_email?: string | null;
  mission_id?: string | null;
  mission_title?: string | null;
  mission_destination?: string | null;
  mission_departure_date?: string | null;
  mission_return_date?: string | null;
  mission_status?: string | null;
  mission_trip_id?: string | null;
  mission_approval_status?: string | null;
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

/** R&R = rest & recuperation / travel policy sign-off (matches PR-style travel fields). */
const RR_LABELS: Record<string, string> = {
  na: "N/A",
  pending: "Pending",
  approved: "Approved",
};

const RR_BADGE: Record<string, "secondary" | "warning" | "success"> = {
  na: "secondary",
  pending: "warning",
  approved: "success",
};

/** Filters / column labels for list view */
const STATUS_FILTERS: { status: string; label: string }[] = [
  { status: "requested", label: "Pending approval" },
  { status: "approved", label: "Approved" },
  { status: "assigned", label: "Assigned" },
  { status: "completed", label: "Completed" },
  { status: "rejected", label: "Rejected" },
  { status: "cancelled", label: "Cancelled" },
];

const KNOWN_STATUS = new Set(STATUS_FILTERS.map((p) => p.status));

function countByStatus(requests: RequestRow[], status: string): number {
  return requests.filter((r) => r.status === status).length;
}

function normalizeRr(s: string | undefined): string {
  const t = (s || "na").toLowerCase();
  return t === "pending" || t === "approved" ? t : "na";
}

interface RefRow {
  code: string;
  label: string;
  active: number;
}

interface PlannedMissionRow {
  id: string;
  destination: string;
  departure_date: string;
  return_date: string;
  passengers: string;
  loadout_summary: string;
  title: string;
  status: string;
  approval_status?: string;
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
  const [listStatusFilter, setListStatusFilter] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<RequestRow | null>(null);
  const [missionPerms, setMissionPerms] = useState<{
    canApprove: boolean;
    canFullEdit: boolean;
    canAllocateVehicle: boolean;
  } | null>(null);
  const [vrEligibility, setVrEligibility] = useState<{ canRequestVehicle: boolean; isApprovedDriver: boolean } | null>(
    null
  );
  const [pendingMissions, setPendingMissions] = useState<PlannedMissionRow[]>([]);

  const roleLooksFleet =
    !!user &&
    (user.role === "fleet_lead" ||
      user.role === "manager" ||
      user.role === "admin" ||
      user.role === "superadmin");
  const canFullEdit = missionPerms?.canFullEdit ?? roleLooksFleet;
  const canApproveMission = missionPerms?.canApprove ?? roleLooksFleet;
  const canAllocateVehicle = missionPerms?.canAllocateVehicle ?? (user?.role === "fleet_lead" || user?.role === "superadmin");

  async function patchMissionApproval(missionId: string, action: "approve" | "reject"): Promise<void> {
    const reason =
      action === "reject" ? window.prompt("Rejection reason (optional):") ?? "" : "";
    const headers = await jsonHeadersWithBearer();
    const res = await fetch(`/api/missions/${missionId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ action, ...(action === "reject" ? { rejectionReason: reason } : {}) }),
    });
    if (!res.ok) return;
    const r2 = await fetch(
      `/api/missions?org=${encodeURIComponent(organizationId)}&status=planned&approvalStatus=pending`,
      { headers }
    );
    const j = (await r2.json()) as PlannedMissionRow[];
    setPendingMissions(Array.isArray(j) ? j : []);
    void loadData();
  }

  const statusCounts = STATUS_FILTERS.map((p) => ({
    ...p,
    count: countByStatus(requests, p.status),
  }));
  const otherCount = requests.filter((r) => !KNOWN_STATUS.has(r.status)).length;

  const filteredListRequests =
    listStatusFilter === null
      ? requests
      : listStatusFilter === "__other__"
        ? requests.filter((r) => !KNOWN_STATUS.has(r.status))
        : requests.filter((r) => r.status === listStatusFilter);
  const sortedListRequests = [...filteredListRequests].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setDetailRequest(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    let cancelled = false;
    void (async () => {
      const headers = await jsonHeadersWithBearer();
      const res = await fetch(
        `/api/me/mission-request-can-approve?org=${encodeURIComponent(organizationId)}`,
        { headers }
      );
      if (!res.ok) {
        if (!cancelled) setMissionPerms(null);
        return;
      }
      const j = (await res.json()) as {
        canApprove?: boolean;
        canFullEdit?: boolean;
        canAllocateVehicle?: boolean;
      };
      if (!cancelled) {
        setMissionPerms({
          canApprove: !!j.canApprove,
          canFullEdit: !!j.canFullEdit,
          canAllocateVehicle: !!j.canAllocateVehicle,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const headers = await jsonHeadersWithBearer();
      const res = await fetch(
        `/api/me/vehicle-request-eligibility?org=${encodeURIComponent(organizationId)}`,
        { headers }
      );
      if (!res.ok) {
        if (!cancelled) setVrEligibility(null);
        return;
      }
      const j = (await res.json()) as { canRequestVehicle?: boolean; isApprovedDriver?: boolean };
      if (!cancelled) {
        setVrEligibility({
          canRequestVehicle: !!j.canRequestVehicle,
          isApprovedDriver: !!j.isApprovedDriver,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!canApproveMission) {
      setPendingMissions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const headers = await jsonHeadersWithBearer();
      const res = await fetch(
        `/api/missions?org=${encodeURIComponent(organizationId)}&status=planned&approvalStatus=pending`,
        { headers }
      );
      if (!res.ok) return;
      const j = (await res.json()) as PlannedMissionRow[];
      if (!cancelled) setPendingMissions(Array.isArray(j) ? j : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, canApproveMission]);

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
          canRequestVehicle={vrEligibility?.canRequestVehicle ?? false}
          onComplete={() => { setShowForm(false); loadData(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {canApproveMission && pendingMissions.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Missions pending PR approval</CardTitle>
            <p className="text-sm text-zinc-600 font-normal">
              Approve or reject trip plans. Drivers can only request a vehicle after the mission is approved.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingMissions.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-zinc-900">{(m.title || m.destination).slice(0, 80)}</span>
                  <span className="text-zinc-500 ml-2">
                    {m.destination} · {m.departure_date}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => void patchMissionApproval(m.id, "approve")}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-red-700 border-red-200"
                    onClick={() => void patchMissionApproval(m.id, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
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
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">Summary</span>
            <span className="mx-2 text-zinc-300">·</span>
            {statusCounts.map(({ status, label, count }) => (
              <span key={status} className="whitespace-nowrap mr-3">
                {label} <strong className="text-zinc-900 tabular-nums">{count}</strong>
              </span>
            ))}
            {otherCount > 0 && (
              <span className="whitespace-nowrap text-amber-800">
                Other <strong className="tabular-nums">{otherCount}</strong>
              </span>
            )}
          </div>

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
            {STATUS_FILTERS.map(({ status, label }) => {
              const n = countByStatus(requests, status);
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
            <div className="text-zinc-500 text-center py-12">No requests in this filter.</div>
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[1000px]">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50/90 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      <th className="px-3 py-2.5 whitespace-nowrap">Created</th>
                      <th className="px-3 py-2.5">Purpose</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">Requester</th>
                      <th className="px-3 py-2.5">Destination</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">Depart</th>
                      <th className="px-3 py-2.5 max-w-[140px]">Mission</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">Status</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">R&amp;R</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">Vehicle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedListRequests.map((req) => (
                      <tr
                        key={req.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDetailRequest(req)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDetailRequest(req);
                          }
                        }}
                        className="border-b border-zinc-100 hover:bg-zinc-50/90 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap text-zinc-500 tabular-nums">
                          {new Date(req.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-zinc-900 max-w-[220px] truncate" title={req.purpose}>
                          {req.purpose || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-700 whitespace-nowrap max-w-[140px] truncate" title={req.requested_by_name}>
                          {req.requested_by_name}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-600 max-w-[180px] truncate" title={req.destination}>
                          {req.destination || "—"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-zinc-600 tabular-nums">
                          {req.departure_date || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-600 max-w-[140px] truncate" title={req.mission_title || req.mission_destination || ""}>
                          {req.mission_title?.trim()
                            ? req.mission_title
                            : req.mission_destination?.trim()
                              ? req.mission_destination
                              : "—"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Badge variant={(STATUS_COLORS[req.status] || "secondary") as "warning" | "success" | "destructive" | "secondary"} className="text-[11px]">
                            {req.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Badge variant={RR_BADGE[normalizeRr(req.rr_status)] ?? "secondary"} className="text-[11px]">
                            {RR_LABELS[normalizeRr(req.rr_status)] ?? req.rr_status ?? "N/A"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-700 whitespace-nowrap max-w-[160px] truncate">
                          {req.assigned_vehicle_code ? (
                            <span title={`${req.assigned_vehicle_make ?? ""} ${req.assigned_vehicle_model ?? ""}`}>
                              {req.assigned_vehicle_code}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-3 py-2 text-xs text-zinc-500 border-t border-zinc-100 bg-zinc-50/50">
                Click a row to open details (read-only view with actions for approvers).
              </p>
            </div>
          )}

          {detailRequest && (
            <RequestDetailModal
              request={detailRequest}
              canFullEdit={canFullEdit}
              canApproveMission={canApproveMission}
              canAllocateVehicle={canAllocateVehicle}
              currentUserEmail={user?.email?.trim() ?? ""}
              pool={pool}
              approverName={user?.name || ""}
              onClose={() => setDetailRequest(null)}
              onPatchSaved={(updated) => {
                setDetailRequest(updated);
                void loadData();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function RequestDetailModal({
  request: r,
  canFullEdit,
  canApproveMission,
  canAllocateVehicle,
  currentUserEmail,
  pool,
  approverName,
  onClose,
  onPatchSaved,
}: {
  request: RequestRow;
  canFullEdit: boolean;
  canApproveMission: boolean;
  canAllocateVehicle: boolean;
  pool: PoolData | null;
  currentUserEmail: string;
  approverName: string;
  onClose: () => void;
  onPatchSaved: (row: RequestRow) => void;
}): React.ReactElement {
  const [isActing, setIsActing] = useState(false);
  const [assignVehicleId, setAssignVehicleId] = useState("");
  const [localRr, setLocalRr] = useState(normalizeRr(r.rr_status));

  useEffect(() => {
    setLocalRr(normalizeRr(r.rr_status));
  }, [r.id, r.rr_status]);

  async function updateStatus(status: string, extra?: Record<string, string>): Promise<void> {
    setIsActing(true);
    const res = await fetch(`/api/vehicle-requests/${r.id}`, {
      method: "PATCH",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ status, approvedByName: approverName, ...extra }),
    });
    setIsActing(false);
    if (res.ok) {
      const row = (await res.json()) as RequestRow;
      onPatchSaved(row);
    }
  }

  async function assignVehicle(): Promise<void> {
    if (!assignVehicleId) return;
    setIsActing(true);
    const res = await fetch(`/api/vehicle-requests/${r.id}/assign`, {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ vehicleId: assignVehicleId, approvedByName: approverName }),
    });
    setIsActing(false);
    if (res.ok) {
      const row = (await res.json()) as RequestRow;
      onPatchSaved(row);
    }
  }

  async function saveRrStatus(): Promise<void> {
    if (normalizeRr(r.rr_status) === localRr) return;
    setIsActing(true);
    const res = await fetch(`/api/vehicle-requests/${r.id}`, {
      method: "PATCH",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ rrStatus: localRr }),
    });
    setIsActing(false);
    if (res.ok) {
      const row = (await res.json()) as RequestRow;
      onPatchSaved(row);
    }
  }

  const availableVehicles = pool?.pools
    ? Object.values(pool.pools)
        .flat()
        .filter((v) => !v.status || v.status === "operational")
    : [];

  const isRequestor =
    !!currentUserEmail &&
    !!r.requested_by_email &&
    currentUserEmail.toLowerCase() === r.requested_by_email.trim().toLowerCase();
  const canEditRr = canFullEdit || isRequestor;
  /** Requestors cannot change R&R after fleet has marked Approved */
  const requestorRrReadOnly =
    isRequestor && !canFullEdit && normalizeRr(r.rr_status) === "approved";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vr-detail-title"
    >
      <div
        className="absolute inset-0"
        aria-hidden
        onClick={() => onClose()}
      />
      <Card className="relative z-10 mt-4 w-full max-w-2xl border-zinc-200 shadow-xl">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 border-b border-zinc-100 pb-4">
          <div>
            <CardTitle id="vr-detail-title" className="text-lg">
              Request details
            </CardTitle>
            <p className="text-sm text-zinc-500 mt-1">{new Date(r.created_at).toLocaleString()}</p>
          </div>
          <span className="flex flex-wrap items-center gap-2">
            {r.priority === "high" && <Badge variant="destructive">High</Badge>}
            <Badge variant={(STATUS_COLORS[r.status] || "secondary") as "warning" | "success" | "destructive" | "secondary"}>
              {r.status}
            </Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => onClose()}>
              Close
            </Button>
          </span>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {(r.mission_id || r.mission_destination) && (
            <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-3 space-y-1.5 text-sm">
              <div className="text-xs font-semibold text-sky-900 uppercase tracking-wide">Mission</div>
              {r.mission_title?.trim() && (
                <div>
                  <span className="text-zinc-500 text-xs">Title </span>
                  <span className="text-zinc-900">{r.mission_title}</span>
                </div>
              )}
              <div>
                <span className="text-zinc-500 text-xs">Destination </span>
                <span className="text-zinc-900">{r.mission_destination || r.destination || "—"}</span>
              </div>
              <div className="text-zinc-700 text-xs">
                {r.mission_departure_date || "—"}
                {r.mission_return_date ? ` → ${r.mission_return_date}` : ""}
                {r.mission_status ? ` · ${r.mission_status}` : ""}
              </div>
              {r.mission_approval_status && (
                <div className="text-zinc-700 text-xs">
                  <span className="text-zinc-500">PR mission approval: </span>
                  {r.mission_approval_status}
                </div>
              )}
              {r.mission_trip_id && (
                <Link
                  href={`/trips?trip=${encodeURIComponent(r.mission_trip_id)}`}
                  className="inline-block text-sm font-medium text-sky-800 underline underline-offset-2 hover:text-sky-950"
                >
                  Open operational trip
                </Link>
              )}
            </div>
          )}

          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Purpose</dt>
              <dd className="text-zinc-900 mt-0.5">{r.purpose || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Requester</dt>
              <dd className="text-zinc-900 mt-0.5">{r.requested_by_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Requested for</dt>
              <dd className="text-zinc-900 mt-0.5">{r.requested_for || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Destination</dt>
              <dd className="text-zinc-900 mt-0.5">{r.destination || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Departure</dt>
              <dd className="text-zinc-900 mt-0.5">{r.departure_date || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Return</dt>
              <dd className="text-zinc-900 mt-0.5">{r.return_date || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Vehicle class</dt>
              <dd className="text-zinc-900 mt-0.5">{r.required_vehicle_class || "Any"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Passengers</dt>
              <dd className="text-zinc-900 mt-0.5">{r.passengers || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Loadout / equipment</dt>
              <dd className="text-zinc-900 mt-0.5 whitespace-pre-wrap">{r.loadout_description || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Notes</dt>
              <dd className="text-zinc-900 mt-0.5 whitespace-pre-wrap">{r.notes || "—"}</dd>
            </div>
          </dl>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-3 space-y-2">
            <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">R&amp;R (rest &amp; recuperation)</div>
            <p className="text-xs text-zinc-600">
              Travel policy sign-off for rest &amp; recuperation, aligned with PR.{" "}
              <strong>Requestors</strong> set N/A or Pending; <strong>fleet management</strong> may mark Approved when clearance is received.
            </p>
            {canEditRr && !requestorRrReadOnly ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px]">
                  <label className="text-xs font-medium text-zinc-600 block mb-1">R&amp;R status</label>
                  <select
                    value={localRr}
                    onChange={(e) => setLocalRr(e.target.value)}
                    className="h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm bg-white"
                  >
                    <option value="na">N/A</option>
                    <option value="pending">Pending</option>
                    {canFullEdit && <option value="approved">Approved</option>}
                  </select>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={isActing || normalizeRr(r.rr_status) === localRr}
                  onClick={() => void saveRrStatus()}
                >
                  Save R&amp;R
                </Button>
              </div>
            ) : (
              <Badge variant={RR_BADGE[normalizeRr(r.rr_status)] ?? "secondary"}>
                {RR_LABELS[normalizeRr(r.rr_status)] ?? "N/A"}
              </Badge>
            )}
          </div>

          {(r.estimated_route_km != null && r.estimated_route_km > 0) && (
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

          {r.assigned_vehicle_code && (
            <div className="text-sm text-emerald-800 font-medium">
              Assigned vehicle: {r.assigned_vehicle_code} — {r.assigned_vehicle_make} {r.assigned_vehicle_model}
            </div>
          )}

          {r.rejection_reason && (
            <div className="text-sm text-red-700 rounded-lg border border-red-100 bg-red-50/80 px-3 py-2">
              {r.rejection_reason}
            </div>
          )}

          {canApproveMission && r.status === "requested" && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-100">
              <Button
                size="sm"
                disabled={isActing}
                onClick={() => void updateStatus("approved")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white touch-manipulation"
              >
                Approve mission
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isActing}
                onClick={() => {
                  const reason = window.prompt("Rejection reason:");
                  if (reason) void updateStatus("rejected", { rejectionReason: reason });
                }}
                className="text-red-600 border-red-200 touch-manipulation"
              >
                Reject
              </Button>
            </div>
          )}

          {canAllocateVehicle && (r.status === "approved" || r.status === "requested") && !r.assigned_vehicle_id && (
            <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-medium text-zinc-600 block mb-1">Assign vehicle</label>
                <select
                  value={assignVehicleId}
                  onChange={(e) => setAssignVehicleId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm bg-white"
                >
                  <option value="">Select available vehicle…</option>
                  {availableVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code} — {v.make} {v.model} ({v.pool})
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" size="sm" disabled={!assignVehicleId || isActing} onClick={() => void assignVehicle()} className="touch-manipulation">
                Assign
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
  canRequestVehicle,
  onComplete,
  onCancel,
}: {
  organizationId: string;
  userId: string;
  userName: string;
  canRequestVehicle: boolean;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [vrSubmitting, setVrSubmitting] = useState(false);
  const [missionSubmitting, setMissionSubmitting] = useState(false);
  const [missionFormError, setMissionFormError] = useState("");
  const [vrFormError, setVrFormError] = useState("");
  const [missionMessage, setMissionMessage] = useState<string | null>(null);
  const [sites, setSites] = useState<RefRow[]>([]);
  const [departments, setDepartments] = useState<RefRow[]>([]);
  const [approvedMissions, setApprovedMissions] = useState<PlannedMissionRow[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(false);
  const [selectedMissionId, setSelectedMissionId] = useState("");
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

  const loadApprovedMissions = useCallback(() => {
    setMissionsLoading(true);
    void fetch(
      `/api/missions?org=${encodeURIComponent(organizationId)}&status=planned&approvalStatus=approved`
    )
      .then((r) => r.json())
      .then((d: unknown) => {
        setApprovedMissions(Array.isArray(d) ? (d as PlannedMissionRow[]) : []);
      })
      .catch(() => setApprovedMissions([]))
      .finally(() => setMissionsLoading(false));
  }, [organizationId]);

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
    loadApprovedMissions();
  }, [loadApprovedMissions]);

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

  async function handleCreateMission(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setMissionMessage(null);
    setMissionFormError("");
    const fd = new FormData(e.currentTarget);
    let destination = "";
    const destChoice = String(fd.get("cmDestination") || "");
    if (destChoice === "__write__") {
      destination = String(fd.get("cmDestinationOther") || "").trim();
      if (!destination) {
        setMissionFormError("Enter a destination or choose a site for the mission.");
        return;
      }
    } else if (destChoice) {
      destination = destChoice;
    } else {
      setMissionFormError("Choose a destination for the mission.");
      return;
    }
    const departureDate = String(fd.get("cmDepartureDate") || "").trim();
    if (!departureDate) {
      setMissionFormError("Departure date is required for the mission.");
      return;
    }
    setMissionSubmitting(true);
    const res = await fetch("/api/missions", {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({
        organizationId,
        title: String(fd.get("cmTitle") || "").slice(0, 240),
        destination,
        departureDate,
        returnDate: String(fd.get("cmReturnDate") || ""),
        passengers: String(fd.get("cmPassengers") || ""),
        loadoutSummary: String(fd.get("cmLoadout") || ""),
        missionType: "other",
        notes: String(fd.get("cmNotes") || ""),
      }),
    });
    setMissionSubmitting(false);
    if (res.ok) {
      setMissionMessage(
        "Mission submitted for PR approval. You cannot request a vehicle until a credentialed approver approves this mission."
      );
      e.currentTarget.reset();
      setDestinationChoice("");
      setDestinationOther("");
      loadApprovedMissions();
    } else {
      const err = await res.json().catch(() => ({}));
      setMissionFormError((err as { error?: string }).error || "Could not create mission.");
    }
  }

  async function handleVehicleRequest(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setVrFormError("");
    if (!canRequestVehicle) {
      setVrFormError("Only drivers on the EHS approved drivers register may request a vehicle.");
      return;
    }
    if (!selectedMissionId) {
      setVrFormError("Select an approved mission.");
      return;
    }
    let requestedFor = "";
    if (requestedForChoice === "__other__") {
      requestedFor = requestedForOther.trim();
      if (!requestedFor) {
        setVrFormError("Enter a team or person, or pick a different option.");
        return;
      }
    } else if (requestedForChoice) {
      const dept = departments.find((d) => d.code === requestedForChoice);
      requestedFor = dept ? dept.label : requestedForChoice;
    }
    const fd = new FormData(e.currentTarget);
    setVrSubmitting(true);
    const res = await fetch("/api/vehicle-requests", {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({
        organizationId,
        missionId: selectedMissionId,
        requestedById: userId,
        requestedByName: userName,
        requestedFor,
        purpose: fd.get("purpose") || "",
        passengers: fd.get("passengers") || "",
        requiredVehicleClass: fd.get("requiredVehicleClass") || "",
        loadoutDescription: fd.get("loadoutDescription") || "",
        priority: fd.get("priority") || "normal",
        rrStatus: fd.get("rrStatus") || "na",
        notes: fd.get("notes") || "",
      }),
    });
    setVrSubmitting(false);
    if (res.ok) onComplete();
    else {
      const err = await res.json().catch(() => ({}));
      setVrFormError((err as { error?: string }).error || "Failed to submit request.");
    }
  }

  const selectedMission = approvedMissions.find((m) => m.id === selectedMissionId);

  return (
    <div className="space-y-6" data-tutorial="tutorial-vr-form">
      <Card className="border-sky-200 bg-sky-50/30">
        <CardHeader>
          <CardTitle className="text-base">1. Create a mission (any signed-in user)</CardTitle>
          <p className="text-sm text-zinc-600 font-normal">
            Trip plans start as pending PR approval. Fleet does not allocate a vehicle until the mission is approved and you submit a vehicle request as an approved driver.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleCreateMission(e)} className="space-y-4">
            <Input name="cmTitle" label="Mission title" placeholder="Short label (optional)" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label className="text-sm font-medium text-zinc-700">Destination *</label>
                <select
                  name="cmDestination"
                  required
                  value={destinationChoice}
                  onChange={(e) => setDestinationChoice(e.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select site or other…</option>
                  {siteRows.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.label}
                    </option>
                  ))}
                  <option value="__write__">Other…</option>
                </select>
                {destinationChoice === "__write__" && (
                  <Input
                    name="cmDestinationOther"
                    label=""
                    value={destinationOther}
                    onChange={(e) => setDestinationOther(e.target.value)}
                    placeholder="Site code or location"
                  />
                )}
                <div className="space-y-2" data-tutorial="tutorial-vr-route-estimate">
                  <p className="text-xs text-zinc-500">Pick a site for route distance estimate.</p>
                  {destinationChoice && destinationChoice !== "__write__" && (
                    <div className="rounded-md border border-zinc-100 bg-white px-3 py-2 text-xs text-zinc-700">
                      {routeEstimateLoading && <span className="text-zinc-500">Calculating…</span>}
                      {!routeEstimateLoading && routeEstimate?.ok && routeEstimate.distanceKm != null && (
                        <span>
                          Est. one-way: <strong>{Math.round(routeEstimate.distanceKm * 10) / 10} km</strong>
                        </span>
                      )}
                      {!routeEstimateLoading && routeEstimate && !routeEstimate.ok && (
                        <span className="text-amber-900">{routeEstimate.message || "Could not estimate route."}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <Input name="cmDepartureDate" label="Departure date *" type="date" required />
              <Input name="cmReturnDate" label="Return date" type="date" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="cmPassengers" label="Passengers" placeholder="Number or names" />
              <Input name="cmLoadout" label="Loadout / equipment" placeholder="Cargo summary for the mission" />
            </div>
            <Input name="cmNotes" label="Mission notes" placeholder="Optional" />
            {missionMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {missionMessage}
              </div>
            )}
            {missionFormError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{missionFormError}</div>
            )}
            <Button type="submit" disabled={missionSubmitting} size="lg" className="touch-manipulation">
              {missionSubmitting ? "Submitting…" : "Submit mission for approval"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-emerald-200">
        <CardHeader>
          <CardTitle className="text-base">2. Request a vehicle (EHS approved drivers only)</CardTitle>
          <p className="text-sm text-zinc-600 font-normal">
            Choose an approved mission, then describe how you need the vehicle. Allocation is done by the fleet team lead after approval steps.
          </p>
        </CardHeader>
        <CardContent>
          {!canRequestVehicle ? (
            <p className="text-sm text-amber-900 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              Your account is not on the EHS approved drivers register for this organization. Ask EHS or fleet to add you if you are eligible to drive company vehicles.
            </p>
          ) : (
            <form onSubmit={(e) => void handleVehicleRequest(e)} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-700 block mb-1">Approved mission *</label>
                <select
                  required
                  value={selectedMissionId}
                  onChange={(e) => setSelectedMissionId(e.target.value)}
                  className="h-10 w-full max-w-xl rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">{missionsLoading ? "Loading…" : "Select an approved mission…"}</option>
                  {approvedMissions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {(m.title?.trim() || m.destination).slice(0, 72)} · {m.departure_date || "—"}
                    </option>
                  ))}
                </select>
                {!missionsLoading && approvedMissions.length === 0 && (
                  <p className="text-xs text-amber-800 mt-1">
                    No approved missions yet. Create a mission above and wait for PR approval.
                  </p>
                )}
              </div>
              {selectedMission && (
                <div className="text-sm text-zinc-700 rounded-md border border-zinc-200 bg-zinc-50/80 px-3 py-2">
                  <span className="text-zinc-500">Mission: </span>
                  {selectedMission.destination} · {selectedMission.departure_date}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Input name="purpose" label="Purpose *" required placeholder="e.g. Site delivery" />
                <div className="flex flex-col gap-1.5 sm:col-span-1">
                  <label className="text-sm font-medium text-zinc-700">Requested for</label>
                  <select
                    value={requestedForChoice}
                    onChange={(e) => setRequestedForChoice(e.target.value)}
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Myself / same as requester</option>
                    {departments.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.label}
                      </option>
                    ))}
                    <option value="__other__">Other…</option>
                  </select>
                  {requestedForChoice === "__other__" && (
                    <Input
                      label=""
                      value={requestedForOther}
                      onChange={(e) => setRequestedForOther(e.target.value)}
                      placeholder="Team or person"
                    />
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                    <option key={c} value={c}>
                      {ASSET_CLASS_LABELS[c]}
                    </option>
                  ))}
                </Select>
                <Input name="loadoutDescription" label="Loadout / equipment" placeholder="For this vehicle request" />
              </div>
              <div className="max-w-md">
                <Select name="rrStatus" label="R&amp;R status (rest &amp; recuperation)">
                  <option value="na">N/A — not applicable</option>
                  <option value="pending">Pending — R&amp;R clearance required</option>
                </Select>
              </div>
              <Input name="notes" label="Notes" placeholder="Additional information" />
              {vrFormError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{vrFormError}</div>
              )}
              <div className="flex gap-3">
                <Button type="submit" disabled={vrSubmitting} size="lg" className="min-h-[48px] touch-manipulation">
                  {vrSubmitting ? "Submitting…" : "Submit vehicle request"}
                </Button>
                <Button type="button" variant="outline" onClick={onCancel} size="lg" className="min-h-[48px]">
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
