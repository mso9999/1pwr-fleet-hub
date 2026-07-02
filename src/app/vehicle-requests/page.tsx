"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  EntityPickerField,
  type EntityPickerOption,
} from "@/components/ui/entity-picker";
import { useAuth } from "@/lib/auth-context";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { useTutorial } from "@/components/tutorial/tutorial-context";
import { ASSET_CLASS, ASSET_CLASS_LABELS, type AssetClass } from "@/types";
import { lPer100kmToUsMpg } from "@/lib/vehicle-fuel-lookup";
import { useOverrideCapability } from "@/lib/useOverrideCapability";
import { cn } from "@/lib/utils";
import { isMultiStopRolloutEnabled } from "@/lib/feature-flags";
import {
  EhsCompliantDriverPickerField,
  type DesignatedOperatorSelection,
} from "@/components/EhsCompliantDriverPickerField";

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
  /** COALESCE(vr.assigned_vehicle_id, mission.assigned_vehicle_id) from list API */
  display_assigned_vehicle_id?: string | null;
  assigned_vehicle_code: string | null;
  assigned_vehicle_make: string | null;
  assigned_vehicle_model: string | null;
  notes: string;
  created_at: string;
  estimated_route_km?: number | null;
  estimated_fuel_liters?: number | null;
  fuel_efficiency_l_per_100km?: number | null;
  /** EHS register — joined for logistics requests */
  designated_operator_label?: string | null;
  designated_operator_email?: string | null;
  /** Rest & recuperation / travel policy — na | pending | approved */
  rr_status?: string;
  /** Joined from users.email for requestor permission checks */
  requested_by_email?: string | null;
  mission_id?: string | null;
  mission_title?: string | null;
  mission_destination?: string | null;
  mission_departure_date?: string | null;
  mission_return_date?: string | null;
  mission_trip_shape?: string | null;
  mission_status?: string | null;
  mission_trip_id?: string | null;
  mission_approval_status?: string | null;
}

interface MissionStopRow {
  id?: string;
  stop_order: number;
  location: string;
  load_out?: string;
  load_in?: string;
  notes?: string;
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

const MISSION_PROFILE_OPTIONS: { value: string; label: string }[] = [
  { value: "local", label: "Local / HQ vicinity" },
  { value: "field", label: "Field deployment" },
];

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

function normalizeTripShape(s: string | undefined): "one_way" | "round_trip" | "multi_stop" {
  const v = String(s || "").toLowerCase();
  if (v === "round_trip") return "round_trip";
  if (v === "multi_stop") return "multi_stop";
  return "one_way";
}

function tripShapeLabel(s: string | undefined): string {
  const v = normalizeTripShape(s);
  if (v === "round_trip") return "Round trip";
  if (v === "multi_stop") return "Multi-stop";
  return "One-way";
}

function missionRouteSummary(m: PlannedMissionRow): string {
  const stops = Array.isArray(m.stops) ? m.stops : [];
  const ordered = [...stops].sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));
  const points = ordered.map((s) => String(s.location || "").trim()).filter(Boolean);
  if (points.length > 0) return points.join(" -> ");
  return String(m.destination || "").trim() || "—";
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
  crew_size?: number;
  personnel_manifest?: string;
  loadout_summary: string;
  title: string;
  status: string;
  approval_status?: string;
  mission_profile?: string;
  trip_shape?: string;
  stops?: MissionStopRow[];
  stop_count?: number;
  required_vehicle_class?: string;
  assigned_vehicle_id?: string | null;
  assigned_vehicle_code?: string | null;
  assigned_vehicle_status?: string;
  lifecycle_status?: string;
  rr_status?: string;
  notes?: string;
  mission_type?: string;
  created_by_name?: string;
  created_at?: string;
  approved_by_name?: string;
  approved_at?: string;
  rejection_reason?: string;
  created_by_id?: string;
  updated_at?: string;
}

interface RouteStopInput {
  location: string;
  loadOut: string;
  loadIn: string;
  notes: string;
}

function missionApprovalStage(statusRaw: string | undefined): {
  label: string;
  tone: "warning" | "success" | "destructive" | "secondary";
} {
  const s = String(statusRaw || "pending").toLowerCase();
  if (s === "draft") return { label: "Draft", tone: "secondary" };
  if (s === "approved") return { label: "Approved", tone: "success" };
  if (s === "rejected") return { label: "Rejected", tone: "destructive" };
  if (s === "revision_requested") return { label: "Revision requested", tone: "warning" };
  return { label: "Pending approval", tone: "secondary" };
}

function MissionApprovalTimeline({ mission }: { mission: PlannedMissionRow }): React.ReactElement {
  const stage = missionApprovalStage(mission.approval_status);
  const created = mission.created_at ? new Date(mission.created_at).toLocaleString() : "";
  const reviewed = mission.approved_at ? new Date(mission.approved_at).toLocaleString() : "";
  const maybeResubmitted =
    String(mission.approval_status || "").toLowerCase() === "pending" &&
    !!mission.updated_at &&
    !!mission.created_at &&
    mission.updated_at !== mission.created_at;

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-zinc-700 uppercase tracking-wide">Approval timeline</span>
        <Badge variant={stage.tone}>{stage.label}</Badge>
      </div>
      <div className="mt-1.5 text-xs text-zinc-700 space-y-0.5">
        <div>
          <span className="font-medium text-zinc-600">Submitted:</span> {created || "—"}
          {mission.created_by_name ? ` by ${mission.created_by_name}` : ""}
        </div>
        {maybeResubmitted && (
          <div>
            <span className="font-medium text-zinc-600">Resubmitted:</span>{" "}
            {mission.updated_at ? new Date(mission.updated_at).toLocaleString() : "—"}
          </div>
        )}
        {reviewed && (
          <div>
            <span className="font-medium text-zinc-600">
              {stage.label === "Approved" ? "Approved" : stage.label === "Rejected" ? "Rejected" : "Reviewed"}:
            </span>{" "}
            {reviewed}
            {mission.approved_by_name ? ` by ${mission.approved_by_name}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function FleetMissionReserveRow({
  mission: m,
  onReserved,
}: {
  mission: PlannedMissionRow;
  onReserved: () => void;
}) {
  const [candidates, setCandidates] = useState<
    Array<{ id: string; code: string; make: string; model: string; status?: string; pool?: string; current_location?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [vehicleId, setVehicleId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    void (async () => {
      const res = await fetch(`/api/missions/${m.id}/reserve-candidates`, {
        headers: await jsonHeadersWithBearer(),
      });
      const j = (await res.json().catch(() => ({}))) as { candidates?: typeof candidates };
      if (!cancelled) {
        setCandidates(Array.isArray(j.candidates) ? j.candidates : []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [m.id]);

  const assigned = !!(m.assigned_vehicle_id || m.assigned_vehicle_code);
  const inactive = m.lifecycle_status && m.lifecycle_status !== "active";

  async function reserve(): Promise<void> {
    if (!vehicleId) return;
    setSaving(true);
    setErr("");
    const res = await fetch(`/api/missions/${m.id}/reserve-vehicle`, {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({
        vehicleId,
        ...(overrideReason.trim().length >= 8 ? { overrideReason: overrideReason.trim() } : {}),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setVehicleId("");
      setOverrideReason("");
      onReserved();
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
    setErr(j.error || "Could not reserve vehicle.");
  }

  if (assigned) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-zinc-700">
          <span className="text-zinc-500">Reserved: </span>
          <strong className="text-emerald-800">{m.assigned_vehicle_code || m.assigned_vehicle_id}</strong>
        </span>
      </div>
    );
  }

  if (inactive) {
    return (
      <span className="text-xs text-amber-800">
        Mission not active ({m.lifecycle_status}). Reactivate before reserving.
      </span>
    );
  }

  return (
    <div className="space-y-2 pt-1 border-t border-zinc-100">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-medium text-zinc-600 block mb-1">Reserve vehicle</label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            disabled={loading || saving}
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
          >
            <option value="">{loading ? "Loading candidates…" : "Select vehicle…"}</option>
            {candidates.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} — {v.make} {v.model}
                {v.status ? ` (${v.status})` : ""}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" size="sm" disabled={!vehicleId || saving} onClick={() => void reserve()} className="touch-manipulation">
          {saving ? "Saving…" : "Reserve"}
        </Button>
      </div>
      <div>
        <label className="text-xs font-medium text-zinc-600">
          Override reason (managers / PR approvers, 8+ characters)
        </label>
        <input
          type="text"
          value={overrideReason}
          onChange={(e) => setOverrideReason(e.target.value)}
          placeholder="Required when: overlapping reservation, or mission extends past the vehicle’s registration disc expiry"
          className="mt-0.5 h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm"
        />
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
    </div>
  );
}

export default function VehicleRequestsPage() {
  const { organizationId, user } = useAuth();
  const { active, trackId, stepIndex } = useTutorial();
  const searchParams = useSearchParams();
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
    canArbitrateCapacity?: boolean;
  } | null>(null);
  const [approvedMissionsFleet, setApprovedMissionsFleet] = useState<PlannedMissionRow[]>([]);
  const [arbitrationDate, setArbitrationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [arbitrationRows, setArbitrationRows] = useState<PlannedMissionRow[]>([]);
  const [pendingMissions, setPendingMissions] = useState<PlannedMissionRow[]>([]);
  const [expandedPendingMissionId, setExpandedPendingMissionId] = useState<string | null>(null);

  const roleLooksFleet =
    !!user &&
    (user.role === "fleet_lead" ||
      user.role === "manager" ||
      user.role === "admin" ||
      user.role === "superadmin");
  const canFullEdit = missionPerms?.canFullEdit ?? roleLooksFleet;
  const canApproveMission = missionPerms?.canApprove ?? roleLooksFleet;
  const canAllocateVehicle = missionPerms?.canAllocateVehicle ?? (user?.role === "fleet_lead" || user?.role === "superadmin");

  const refetchApprovedMissionsFleet = useCallback(async () => {
    if (!canAllocateVehicle) {
      setApprovedMissionsFleet([]);
      return;
    }
    const headers = await jsonHeadersWithBearer();
    const res = await fetch(
      `/api/missions?org=${encodeURIComponent(organizationId)}&status=planned&approvalStatus=approved`,
      { headers }
    );
    if (!res.ok) return;
    const j = (await res.json()) as PlannedMissionRow[];
    setApprovedMissionsFleet(Array.isArray(j) ? j : []);
  }, [organizationId, canAllocateVehicle]);

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

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function patchMissionArbitration(
    missionId: string,
    action: "defer" | "cancel_capacity" | "reactivate"
  ): Promise<void> {
    const reason =
      window.prompt(
        action === "reactivate"
          ? "Reason for reactivation (at least 4 characters):"
          : "Management decision — reason (at least 4 characters):",
        action === "reactivate" ? "Reactivated for operations" : ""
      )?.trim() ?? "";
    if (reason.length < 4) {
      if (reason.length > 0) window.alert("Reason must be at least 4 characters.");
      return;
    }
    const headers = await jsonHeadersWithBearer();
    const res = await fetch(`/api/missions/${missionId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ action, reason }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(j.error || "Update failed");
      return;
    }
    void loadData();
    const q = await fetch(
      `/api/missions/arbitration-queue?org=${encodeURIComponent(organizationId)}&date=${encodeURIComponent(arbitrationDate)}`,
      { headers }
    );
    if (q.ok) {
      const j2 = (await q.json()) as { missions?: PlannedMissionRow[] };
      setArbitrationRows(Array.isArray(j2.missions) ? j2.missions : []);
    }
    void refetchApprovedMissionsFleet();
  }

  async function patchMissionApproval(
    missionId: string,
    action: "approve" | "reject" | "revise"
  ): Promise<void> {
    const reason =
      action === "reject"
        ? window.prompt("Rejection reason (optional):") ?? ""
        : action === "revise"
          ? window.prompt("What should the requestor revise? (required, 8+ chars)") ?? ""
          : "";
    if (action === "revise" && reason.trim().length < 8) {
      window.alert("Provide clear revision feedback (at least 8 characters).");
      return;
    }
    const headers = await jsonHeadersWithBearer();
    const res = await fetch(`/api/missions/${missionId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        action,
        ...(action === "reject" ? { rejectionReason: reason } : {}),
        ...(action === "revise" ? { revisionReason: reason.trim() } : {}),
      }),
    });
    if (!res.ok) return;
    const r2 = await fetch(
      `/api/missions?org=${encodeURIComponent(organizationId)}&status=planned&approvalStatus=pending`,
      { headers }
    );
    const j = (await r2.json()) as PlannedMissionRow[];
    setPendingMissions(Array.isArray(j) ? j : []);
    if ((action === "approve" || action === "revise") && expandedPendingMissionId === missionId) {
      setExpandedPendingMissionId(null);
    }
    void loadData();
    void refetchApprovedMissionsFleet();
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
        canArbitrateCapacity?: boolean;
      };
      if (!cancelled) {
        setMissionPerms({
          canApprove: !!j.canApprove,
          canFullEdit: !!j.canFullEdit,
          canAllocateVehicle: !!j.canAllocateVehicle,
          canArbitrateCapacity: !!j.canArbitrateCapacity,
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
      setExpandedPendingMissionId(null);
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
      if (!cancelled) {
        const rows = Array.isArray(j) ? j : [];
        setPendingMissions(rows);
        if (expandedPendingMissionId && !rows.some((m) => m.id === expandedPendingMissionId)) {
          setExpandedPendingMissionId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, canApproveMission, expandedPendingMissionId]);

  useEffect(() => {
    void refetchApprovedMissionsFleet();
  }, [refetchApprovedMissionsFleet]);

  useEffect(() => {
    if (!missionPerms?.canArbitrateCapacity) {
      setArbitrationRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const headers = await jsonHeadersWithBearer();
      const res = await fetch(
        `/api/missions/arbitration-queue?org=${encodeURIComponent(organizationId)}&date=${encodeURIComponent(arbitrationDate)}`,
        { headers }
      );
      if (!res.ok) return;
      const j = (await res.json()) as { missions?: PlannedMissionRow[] };
      if (!cancelled) setArbitrationRows(Array.isArray(j.missions) ? j.missions : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, arbitrationDate, missionPerms?.canArbitrateCapacity]);

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

  useEffect(() => {
    if (!active || trackId !== "fieldDeployment") return;
    setView("requests");
    if (stepIndex >= 1 && stepIndex <= 2) setShowForm(true);
    else setShowForm(false);
  }, [active, trackId, stepIndex]);

  useEffect(() => {
    if (searchParams.get("newMission") !== "1") return;
    setView("requests");
    setShowForm(true);
  }, [searchParams]);

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
              + New mission
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

      {canAllocateVehicle && approvedMissionsFleet.filter((m) => !m.lifecycle_status || m.lifecycle_status === "active").length > 0 && (
        <Card className="border-emerald-100 bg-emerald-50/20" data-tutorial="tutorial-vr-fleet-reserve">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fleet: reserve vehicles on approved missions</CardTitle>
            <p className="text-sm text-zinc-600 font-normal">
              Pick a candidate that matches the mission dates and required class. Today’s departures only allow operational vehicles; future dates allow additional statuses per policy.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {approvedMissionsFleet
              .filter((m) => !m.lifecycle_status || m.lifecycle_status === "active")
              .map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm space-y-1"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-900">{(m.title || m.destination).slice(0, 80)}</span>
                      <span className="text-zinc-500 ml-2 block sm:inline">
                        {m.destination} · {m.departure_date}
                        {m.return_date ? ` → ${m.return_date}` : ""}
                      </span>
                      <div className="text-xs text-zinc-600 mt-1">
                        <span className="font-medium">Route:</span> {missionRouteSummary(m)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 shrink-0">
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {tripShapeLabel(m.trip_shape)}
                      </Badge>
                      {m.required_vehicle_class && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          Class: {m.required_vehicle_class}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <FleetMissionReserveRow
                    mission={m}
                    onReserved={() => {
                      void loadData();
                      void refetchApprovedMissionsFleet();
                    }}
                  />
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {missionPerms?.canArbitrateCapacity && (
        <Card className="border-violet-200 bg-violet-50/30" data-tutorial="tutorial-vr-arbitration">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Management: capacity arbitration (departure day)</CardTitle>
            <p className="text-sm text-zinc-600 font-normal">
              Approved missions departing on the selected date. Defer or cancel when operational capacity is insufficient. Fleet lead alone cannot arbitrate who loses a slot.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-xs font-medium text-zinc-600 block mb-1">Departure date</label>
                <input
                  type="date"
                  value={arbitrationDate}
                  onChange={(e) => setArbitrationDate(e.target.value)}
                  className="h-10 rounded-lg border border-zinc-200 px-2 text-sm bg-white"
                />
              </div>
            </div>
            {arbitrationRows.length === 0 ? (
              <p className="text-sm text-zinc-600">No approved missions on this date.</p>
            ) : (
              <ul className="space-y-2">
                {arbitrationRows.map((m) => {
                  const arbActive = !m.lifecycle_status || m.lifecycle_status === "active";
                  return (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-900">{(m.title || m.destination).slice(0, 72)}</span>
                      {!arbActive && (
                        <Badge variant="warning" className="ml-2 text-[10px] align-middle">
                          {String(m.lifecycle_status).replace(/_/g, " ")}
                        </Badge>
                      )}
                      <span className="text-zinc-500 ml-2">
                        {m.departure_date}
                        {m.assigned_vehicle_code ? ` · ${m.assigned_vehicle_code}` : " · no vehicle"}
                      </span>
                      <div className="text-xs text-zinc-600 mt-1">
                        {tripShapeLabel(m.trip_shape)} · {missionRouteSummary(m)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      {arbActive ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-amber-900 border-amber-200"
                            onClick={() => void patchMissionArbitration(m.id, "defer")}
                          >
                            Defer
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-red-800 border-red-200"
                            onClick={() => void patchMissionArbitration(m.id, "cancel_capacity")}
                          >
                            Cancel (capacity)
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => void patchMissionArbitration(m.id, "reactivate")}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {canApproveMission && pendingMissions.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40" data-tutorial="tutorial-vr-pending-approval">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Missions pending management approval</CardTitle>
            <p className="text-sm text-zinc-600 font-normal">
              Open a mission to review trip-plan details before approving or rejecting. Drivers can only request a vehicle after mission approval.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingMissions.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    setExpandedPendingMissionId((prev) => (prev === m.id ? null : m.id))
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-900">
                          {(m.title || m.destination).slice(0, 120)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {expandedPendingMissionId === m.id ? "▲ Hide details" : "▼ View details"}
                        </span>
                      </div>
                      <div className="text-zinc-500 mt-0.5">
                        {m.destination} · {m.departure_date}
                        {m.return_date ? ` → ${m.return_date}` : ""}
                      </div>
                      <div className="text-xs text-zinc-600 mt-1">
                        <span className="font-medium">Route:</span> {missionRouteSummary(m)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 shrink-0">
                      <Badge variant="secondary">{tripShapeLabel(m.trip_shape)}</Badge>
                      {m.mission_profile && (
                        <Badge variant="secondary" className="capitalize">
                          {m.mission_profile}
                        </Badge>
                      )}
                      {m.required_vehicle_class && (
                        <Badge variant="secondary">
                          {ASSET_CLASS_LABELS[m.required_vehicle_class as AssetClass] ??
                            m.required_vehicle_class}
                        </Badge>
                      )}
                      {(() => {
                        const crew = typeof m.crew_size === "number" && m.crew_size > 0 ? m.crew_size : null;
                        if (crew != null) {
                          return (
                            <Badge variant="secondary">
                              {crew} pax
                            </Badge>
                          );
                        }
                        if (m.passengers) {
                          return (
                            <Badge variant="secondary">
                              {m.passengers} pax
                            </Badge>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </button>
                {expandedPendingMissionId === m.id && (
                  <div className="mt-3 space-y-3 border-t border-amber-100 pt-3">
                    <MissionApprovalTimeline mission={m} />
                    <dl className="grid gap-2 text-xs text-zinc-700 sm:grid-cols-2">
                      <div>
                        <dt className="text-zinc-500 uppercase tracking-wide">Created by</dt>
                        <dd className="text-zinc-900 mt-0.5">{m.created_by_name || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 uppercase tracking-wide">Created</dt>
                        <dd className="text-zinc-900 mt-0.5">
                          {m.created_at ? new Date(m.created_at).toLocaleString() : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 uppercase tracking-wide">Mission type</dt>
                        <dd className="text-zinc-900 mt-0.5">{m.mission_type || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 uppercase tracking-wide">Trip shape</dt>
                        <dd className="text-zinc-900 mt-0.5">{tripShapeLabel(m.trip_shape)}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-zinc-500 uppercase tracking-wide">Planned route</dt>
                        <dd className="text-zinc-900 mt-0.5">{missionRouteSummary(m)}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500 uppercase tracking-wide">R&amp;R</dt>
                        <dd className="text-zinc-900 mt-0.5">
                          {RR_LABELS[normalizeRr(m.rr_status)] ?? "N/A"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-zinc-500 uppercase tracking-wide">Loadout / equipment</dt>
                        <dd className="text-zinc-900 mt-0.5 whitespace-pre-wrap">
                          {m.loadout_summary || "—"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-zinc-500 uppercase tracking-wide">Notes</dt>
                        <dd className="text-zinc-900 mt-0.5 whitespace-pre-wrap">{m.notes || "—"}</dd>
                      </div>
                    </dl>
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
                        className="text-amber-800 border-amber-300"
                        onClick={() => void patchMissionApproval(m.id, "revise")}
                      >
                        Revise &amp; resubmit
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
                )}
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
              organizationId={organizationId}
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
                void refetchApprovedMissionsFleet();
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
  organizationId,
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
  organizationId: string;
  canFullEdit: boolean;
  canApproveMission: boolean;
  canAllocateVehicle: boolean;
  pool: PoolData | null;
  currentUserEmail: string;
  approverName: string;
  onClose: () => void;
  onPatchSaved: (row: RequestRow) => void;
}) {
  const [isActing, setIsActing] = useState(false);
  const [assignVehicleId, setAssignVehicleId] = useState("");
  const [assignOverlapReason, setAssignOverlapReason] = useState("");
  const [reserveOptions, setReserveOptions] = useState<EntityPickerOption[]>([]);
  const [reserveLoading, setReserveLoading] = useState(false);
  const [localRr, setLocalRr] = useState(normalizeRr(r.rr_status));

  useEffect(() => {
    setLocalRr(normalizeRr(r.rr_status));
  }, [r.id, r.rr_status]);

  useEffect(() => {
    setAssignVehicleId("");
    setAssignOverlapReason("");
  }, [r.id]);

  useEffect(() => {
    if (!r.mission_id || !canAllocateVehicle) {
      setReserveOptions([]);
      return;
    }
    let cancelled = false;
    setReserveLoading(true);
    void (async () => {
      const res = await fetch(`/api/missions/${r.mission_id}/reserve-candidates`, {
        headers: await jsonHeadersWithBearer(),
      });
      const j = (await res.json().catch(() => ({}))) as {
        candidates?: Array<{
          id?: unknown;
          code?: unknown;
          make?: unknown;
          model?: unknown;
          pool?: unknown;
          current_location?: unknown;
          status?: unknown;
        }>;
      };
      if (cancelled) return;
      const rows = Array.isArray(j.candidates) ? j.candidates : [];
      setReserveOptions(
        rows.map((v) => ({
          value: String(v.id ?? ""),
          label: `${String(v.code ?? "")} — ${String(v.make ?? "")} ${String(v.model ?? "")}`,
          description: `Pool: ${v.pool != null ? String(v.pool) : "—"}${v.current_location != null ? ` · ${String(v.current_location)}` : ""}`,
          meta: v.status != null ? String(v.status) : "",
          metaTone: "info" as const,
          searchTokens: [
            String(v.code ?? ""),
            String(v.make ?? ""),
            String(v.model ?? ""),
            String(v.pool ?? ""),
            String(v.current_location ?? ""),
          ],
        }))
      );
      setReserveLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [r.mission_id, canAllocateVehicle]);

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
    const missionPath = !!r.mission_id;
    const url = missionPath
      ? `/api/missions/${r.mission_id}/reserve-vehicle`
      : `/api/vehicle-requests/${r.id}/assign`;
    const body = missionPath
      ? {
          vehicleId: assignVehicleId,
          ...(assignOverlapReason.trim().length >= 8 ? { overrideReason: assignOverlapReason.trim() } : {}),
        }
      : {
          vehicleId: assignVehicleId,
          approvedByName: approverName,
          ...(assignOverlapReason.trim().length >= 8 ? { overrideReason: assignOverlapReason.trim() } : {}),
        };
    const res = await fetch(url, {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify(body),
    });
    setIsActing(false);
    if (res.ok) {
      if (missionPath) {
        const list = await fetch(`/api/vehicle-requests?org=${encodeURIComponent(organizationId)}`, {
          headers: await jsonHeadersWithBearer(),
        });
        if (list.ok) {
          const all = (await list.json()) as RequestRow[];
          const row = Array.isArray(all) ? all.find((x) => x.id === r.id) : undefined;
          if (row) onPatchSaved(row);
          else onPatchSaved(r);
        } else onPatchSaved(r);
      } else {
        const row = (await res.json()) as RequestRow;
        onPatchSaved(row);
      }
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    window.alert(j.error || "Could not assign or reserve vehicle.");
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

  const hasVehicleAssigned = Boolean(r.display_assigned_vehicle_id?.trim() || r.assigned_vehicle_id);
  const poolVehiclePickerOptions = availableVehicles.map<EntityPickerOption>((v) => ({
    value: v.id,
    label: `${v.code} — ${v.make} ${v.model}`,
    description: `Pool: ${v.pool}${v.current_location ? ` · ${v.current_location}` : ""}`,
    meta: v.pool,
    metaTone: "info",
    searchTokens: [v.code, v.make, v.model, v.pool, v.current_location ?? ""],
  }));
  const reservePickerOptions = r.mission_id ? reserveOptions : poolVehiclePickerOptions;

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
              {r.mission_trip_shape && (
                <div className="text-zinc-700 text-xs">
                  <span className="text-zinc-500">Trip shape: </span>
                  {tripShapeLabel(r.mission_trip_shape)}
                </div>
              )}
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
            {(r.designated_operator_label || r.designated_operator_email) && (
              <div>
                <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Designated driver (EHS)</dt>
                <dd className="text-zinc-900 mt-0.5">
                  {r.designated_operator_label || r.designated_operator_email}
                  {r.designated_operator_email && r.designated_operator_label ? (
                    <span className="text-zinc-500 text-xs block">{r.designated_operator_email}</span>
                  ) : null}
                </dd>
              </div>
            )}
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

          {canAllocateVehicle && (r.status === "approved" || r.status === "requested") && !hasVehicleAssigned && (
            <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex-1 min-w-[200px] space-y-2">
                <EntityPickerField
                  label={r.mission_id ? "Reserve vehicle (mission)" : "Assign vehicle"}
                  value={assignVehicleId}
                  onChange={setAssignVehicleId}
                  modalTitle={r.mission_id ? "Pick a reservable vehicle" : "Pick an available vehicle"}
                  modalDescription={
                    r.mission_id
                      ? "Candidates match the mission departure date rules and required asset class."
                      : "Operational vehicles in the pool, grouped by make + model."
                  }
                  searchPlaceholder="Search by code, make, model, pool…"
                  placeholder={
                    r.mission_id && reserveLoading ? "Loading candidates…" : "Select vehicle…"
                  }
                  loading={!!r.mission_id && reserveLoading}
                  showCount
                  options={reservePickerOptions}
                  emptyState={
                    <span>
                      {r.mission_id
                        ? "No vehicles match this mission’s dates, status rules, and required class. Adjust the mission or vehicle record, or use a manager overlap override if appropriate."
                        : "No operational vehicles available right now. Check the pool for deployed or maintenance status."}
                    </span>
                  }
                />
                {r.mission_id && (
                  <p className="text-[11px] text-zinc-500">
                    Candidates respect mission dates, status rules, and required class. Use the override box below if the vehicle has an overlapping reservation or its registration disc expires before the mission end date.
                  </p>
                )}
                <div>
                  <label className="text-xs font-medium text-zinc-600">
                    Override reason (managers / PR approvers, 8+ characters)
                  </label>
                  <textarea
                    value={assignOverlapReason}
                    onChange={(e) => setAssignOverlapReason(e.target.value)}
                    rows={2}
                    placeholder={
                      r.mission_id
                        ? "Overlapping reservation, or mission runs past registration disc expiry on the chosen vehicle"
                        : "Only if the request window extends past the vehicle’s registration disc expiry"
                    }
                    className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <Button type="button" size="sm" disabled={!assignVehicleId || isActing} onClick={() => void assignVehicle()} className="touch-manipulation">
                {r.mission_id ? "Reserve" : "Assign"}
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
  onComplete,
  onCancel,
}: {
  organizationId: string;
  userId: string;
  userName: string;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const multiStopEnabled = isMultiStopRolloutEnabled();
  const [vrSubmitting, setVrSubmitting] = useState(false);
  const [missionSubmitting, setMissionSubmitting] = useState(false);
  const [missionFormError, setMissionFormError] = useState("");
  const [vrFormError, setVrFormError] = useState("");
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  // Scenario B: when true, this mission is a public-transport mission
  // (team travels by public transport, no company vehicle). Hides the
  // required-vehicle-class picker and shows a mandatory justification
  // textarea instead.
  const [publicTransport, setPublicTransport] = useState(false);
  const [publicTransportJustification, setPublicTransportJustification] = useState("");
  const { canOverride } = useOverrideCapability(organizationId);
  const managerOverrideReady =
    canOverride && overrideEnabled && overrideReason.trim().length >= 8;
  const [missionMessage, setMissionMessage] = useState<string | null>(null);
  const [sites, setSites] = useState<RefRow[]>([]);
  const [departments, setDepartments] = useState<RefRow[]>([]);
  const [approvedMissions, setApprovedMissions] = useState<PlannedMissionRow[]>([]);
  const [revisionRequestedMissions, setRevisionRequestedMissions] = useState<PlannedMissionRow[]>([]);
  const [draftMissions, setDraftMissions] = useState<PlannedMissionRow[]>([]);
  const [editingMissionDraftId, setEditingMissionDraftId] = useState<string | null>(null);
  const [missionsLoading, setMissionsLoading] = useState(false);
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const [destinationChoice, setDestinationChoice] = useState("");
  const [destinationOther, setDestinationOther] = useState("");
  const [tripShape, setTripShape] = useState<"one_way" | "round_trip" | "multi_stop">("one_way");
  const [routeOrigin, setRouteOrigin] = useState("HQ");
  const [routeStops, setRouteStops] = useState<RouteStopInput[]>([
    { location: "", loadOut: "", loadIn: "", notes: "" },
  ]);
  const [requestedForChoice, setRequestedForChoice] = useState("");
  const [requestedForOther, setRequestedForOther] = useState("");
  const [designatedOperator, setDesignatedOperator] = useState<DesignatedOperatorSelection | null>(null);
  const [routeEstimateLoading, setRouteEstimateLoading] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState<{
    ok: boolean;
    message?: string | null;
    distanceKm: number | null;
    fuelLiters: number | null;
    lPer100km: number | null;
  } | null>(null);
  const missionFormRef = useRef<HTMLFormElement | null>(null);

  const loadApprovedMissions = useCallback(() => {
    setMissionsLoading(true);
    void (async () => {
      const headers = await jsonHeadersWithBearer();
      Promise.all([
        fetch(`/api/missions?org=${encodeURIComponent(organizationId)}&status=planned&approvalStatus=approved`, { headers }).then((r) =>
          r.json()
        ),
        fetch(`/api/missions?org=${encodeURIComponent(organizationId)}&status=planned&approvalStatus=revision_requested`, { headers }).then(
          (r) => r.json()
        ),
        fetch(`/api/missions?org=${encodeURIComponent(organizationId)}&status=planned&approvalStatus=draft`, { headers }).then(
          (r) => r.json()
        ),
      ])
      .then(([approvedRaw, revisionRaw, draftRaw]) => {
        const approved = Array.isArray(approvedRaw) ? (approvedRaw as PlannedMissionRow[]) : [];
        const revisions = Array.isArray(revisionRaw) ? (revisionRaw as PlannedMissionRow[]) : [];
        const drafts = Array.isArray(draftRaw) ? (draftRaw as PlannedMissionRow[]) : [];
        setApprovedMissions(approved);
        setRevisionRequestedMissions(
          revisions.filter((m) => String(m.created_by_id || "").trim() === userId)
        );
        setDraftMissions(drafts);
      })
      .catch(() => {
        setApprovedMissions([]);
        setRevisionRequestedMissions([]);
        setDraftMissions([]);
      })
      .finally(() => setMissionsLoading(false));
    })();
  }, [organizationId, userId]);

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
    setDesignatedOperator(null);
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
  const selectedMission = approvedMissions.find((m) => m.id === selectedMissionId);

  function loadMissionDraftIntoForm(m: PlannedMissionRow): void {
    setEditingMissionDraftId(m.id);
    const knownSite = siteRows.some((s) => s.code === m.destination);
    setDestinationChoice(knownSite ? m.destination : "__write__");
    setDestinationOther(knownSite ? "" : String(m.destination || ""));
    const shape = normalizeTripShape(m.trip_shape);
    setTripShape(shape);
    const orderedStops = [...(m.stops || [])].sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));
    if (shape === "round_trip" && orderedStops.length > 0) {
      const returnLeg = orderedStops[orderedStops.length - 1];
      setRouteOrigin(String(returnLeg.location || "HQ"));
      const interior = orderedStops.slice(0, -1).map((s) => ({
        location: String(s.location || ""),
        loadOut: String(s.load_out || ""),
        loadIn: String(s.load_in || ""),
        notes: String(s.notes || ""),
      }));
      setRouteStops(interior.length > 0 ? interior : [{ location: "", loadOut: "", loadIn: "", notes: "" }]);
    } else {
      setRouteOrigin("HQ");
      const nextStops = orderedStops.map((s) => ({
        location: String(s.location || ""),
        loadOut: String(s.load_out || ""),
        loadIn: String(s.load_in || ""),
        notes: String(s.notes || ""),
      }));
      setRouteStops(nextStops.length > 0 ? nextStops : [{ location: "", loadOut: "", loadIn: "", notes: "" }]);
    }
    const form = missionFormRef.current;
    if (!form) return;
    const setValue = (name: string, value: string): void => {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (el) el.value = value;
    };
    setValue("cmTitle", String(m.title || ""));
    setValue("cmDepartureDate", String(m.departure_date || ""));
    setValue("cmReturnDate", String(m.return_date || ""));
    setValue("cmCrewSize", String(m.crew_size ?? 1));
    setValue("cmPassengers", String(m.passengers || ""));
    setValue("cmLoadout", String(m.loadout_summary || ""));
    setValue("cmNotes", String(m.notes || ""));
    setValue("cmMissionProfile", String(m.mission_profile || "local"));
    setValue("cmRequiredVehicleClass", String(m.required_vehicle_class || ""));
    setValue("cmRrStatus", normalizeRr(m.rr_status));
  }

  function addRouteStop(): void {
    setRouteStops((prev) => [...prev, { location: "", loadOut: "", loadIn: "", notes: "" }]);
  }

  function updateRouteStop(idx: number, field: keyof RouteStopInput, value: string): void {
    setRouteStops((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function removeRouteStop(idx: number): void {
    setRouteStops((prev) => prev.filter((_, i) => i !== idx));
  }

  async function resubmitMissionForApproval(missionId: string): Promise<void> {
    const ok = window.confirm(
      "Resubmit this mission for management approval now? Make sure required changes are complete."
    );
    if (!ok) return;
    const res = await fetch(`/api/missions/${missionId}`, {
      method: "PATCH",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ action: "resubmit" }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setMissionFormError(err.error || "Could not resubmit mission.");
      return;
    }
    setMissionMessage("Mission resubmitted for management approval.");
    loadApprovedMissions();
  }

  async function submitDraftMissionNow(missionId: string): Promise<void> {
    const headers = await jsonHeadersWithBearer();
    const res = await fetch(`/api/missions/${missionId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ action: "submit" }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setMissionFormError(err.error || "Could not submit mission draft.");
      return;
    }
    setMissionMessage("Mission submitted for management approval.");
    setEditingMissionDraftId(null);
    loadApprovedMissions();
  }

  async function handleCreateMission(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setMissionMessage(null);
    setMissionFormError("");
    const fd = new FormData(e.currentTarget);
    const intent = String(fd.get("intent") || "submit").toLowerCase();
    const saveAsDraft = intent === "savedraft";
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
    if (publicTransport && publicTransportJustification.trim().length < 20) {
      setMissionFormError(
        "Public-transport missions require a justification of at least 20 characters (e.g. 'no vehicles available for this date range').",
      );
      return;
    }
    const reqClass = publicTransport
      ? ""
      : String(fd.get("cmRequiredVehicleClass") || "").trim();
    if (!publicTransport && !reqClass) {
      setMissionFormError("Select the vehicle type / asset class required for this mission.");
      return;
    }
    const crewParsed = parseInt(String(fd.get("cmCrewSize") || ""), 10);
    if (!Number.isFinite(crewParsed) || crewParsed < 1) {
      setMissionFormError("Crew size is required and must be a whole number of at least 1.");
      return;
    }
    const normalizedStops = routeStops
      .map((s) => ({
        location: s.location.trim(),
        loadOut: s.loadOut.trim(),
        loadIn: s.loadIn.trim(),
        notes: s.notes.trim(),
      }))
      .filter((s) => s.location);
    if (multiStopEnabled && tripShape === "multi_stop" && normalizedStops.length < 2) {
      setMissionFormError("Multi-stop missions need at least two planned stops.");
      return;
    }
    const finalStops =
      !multiStopEnabled || tripShape === "one_way"
        ? []
        : tripShape === "round_trip"
          ? [
              ...(normalizedStops.length > 0 ? normalizedStops : [{ location: destination, loadOut: "", loadIn: "", notes: "" }]),
              { location: routeOrigin.trim() || "HQ", loadOut: "", loadIn: "", notes: "Return leg" },
            ]
          : normalizedStops;
    setMissionSubmitting(true);
    const payload = {
      organizationId,
      title: String(fd.get("cmTitle") || "").slice(0, 240),
      destination,
      departureDate,
      returnDate: String(fd.get("cmReturnDate") || ""),
      passengers: String(fd.get("cmPassengers") || ""),
      crewSize: crewParsed,
      loadoutSummary: String(fd.get("cmLoadout") || ""),
      missionType: "other",
      notes: String(fd.get("cmNotes") || ""),
      missionProfile: String(fd.get("cmMissionProfile") || "local"),
      tripShape: multiStopEnabled ? tripShape : "one_way",
      stops: multiStopEnabled ? finalStops : [],
      requiredVehicleClass: reqClass,
      rrStatus: String(fd.get("cmRrStatus") || "na"),
      transportMode: publicTransport ? "public_transport" : "company_vehicle",
      publicTransportJustification: publicTransport
        ? publicTransportJustification.trim()
        : "",
    };
    const headers = await jsonHeadersWithBearer();
    let res: Response;
    if (editingMissionDraftId) {
      res = await fetch(`/api/missions/${editingMissionDraftId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });
      if (res.ok && !saveAsDraft) {
        res = await fetch(`/api/missions/${editingMissionDraftId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ action: "submit" }),
        });
      }
    } else {
      res = await fetch("/api/missions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...payload,
          action: saveAsDraft ? "saveDraft" : "submit",
        }),
      });
    }
    setMissionSubmitting(false);
    if (res.ok) {
      setMissionMessage(
        saveAsDraft
          ? "Mission draft saved. Only you, admins, and IT can view/edit it until submission."
          : "Mission submitted for management approval (profile, vehicle class, and R&R are stored on the mission). After approval, approved drivers may submit a logistics request below so the row appears in the pool queue; fleet reserves a specific vehicle on the mission."
      );
      e.currentTarget.reset();
      setDestinationChoice("");
      setDestinationOther("");
      setTripShape("one_way");
      setRouteOrigin("HQ");
      setRouteStops([{ location: "", loadOut: "", loadIn: "", notes: "" }]);
      setEditingMissionDraftId(null);
      loadApprovedMissions();
    } else {
      const err = await res.json().catch(() => ({}));
      setMissionFormError((err as { error?: string }).error || "Could not create mission.");
    }
  }

  async function handleVehicleRequest(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setVrFormError("");
    const overrideReady = managerOverrideReady;
    if (!designatedOperator?.id && !overrideReady) {
      setVrFormError(
        "Select the approved driver for this request from the list (EHS register for the organisation shown in the dialog). If you are eligible but not listed, ask EHS to complete your file."
      );
      return;
    }
    if (!selectedMissionId && !overrideReady) {
      setVrFormError("Select an approved mission.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const missionClass = selectedMission?.required_vehicle_class?.trim() ?? "";
    const vehicleClass =
      missionClass || String(fd.get("requiredVehicleClass") || "").trim();
    if (!vehicleClass && !overrideReady) {
      setVrFormError(
        "Select a mission that has a required vehicle class, or choose the vehicle type below (legacy missions without a class)."
      );
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
    setVrSubmitting(true);
    const payload: Record<string, unknown> = {
      organizationId,
      missionId: selectedMissionId,
      requestedById: userId,
      requestedByName: userName,
      requestedFor,
      purpose: fd.get("purpose") || "",
      passengers: fd.get("passengers") || "",
      requiredVehicleClass: vehicleClass,
      loadoutDescription: fd.get("loadoutDescription") || "",
      priority: fd.get("priority") || "normal",
      rrStatus: fd.get("rrStatus") || "na",
      notes: fd.get("notes") || "",
    };
    if (overrideReady) {
      payload.overrideReason = overrideReason.trim();
    }
    if (designatedOperator?.id) {
      payload.designatedOperatorId = designatedOperator.id;
    }
    const res = await fetch("/api/vehicle-requests", {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify(payload),
    });
    setVrSubmitting(false);
    if (res.ok) onComplete();
    else {
      const err = await res.json().catch(() => ({}));
      setVrFormError((err as { error?: string }).error || "Failed to submit request.");
    }
  }

  return (
    <div className="space-y-6" data-tutorial="tutorial-vr-form">
      <Card className="border-sky-200 bg-sky-50/30">
        <CardHeader>
          <CardTitle className="text-base">1. Create a mission (any signed-in user)</CardTitle>
          <p className="text-sm text-zinc-600 font-normal">
            One form captures timeframe, route shape (one-way, round-trip, multi-stop), destination, mission profile, required vehicle class, loadout, and R&amp;R. Management approves the mission; fleet then reserves a pool vehicle on the mission.
          </p>
        </CardHeader>
        <CardContent>
          <form ref={missionFormRef} onSubmit={(e) => void handleCreateMission(e)} className="space-y-4">
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
                        <span className="text-amber-900">
                          {routeEstimate.message || "Could not estimate route."}{" "}
                          {routeEstimate.message && /set GPS on site/i.test(routeEstimate.message) && (
                            <a
                              href="/admin"
                              className="text-blue-700 underline underline-offset-2"
                            >
                              Open Admin → Sites
                            </a>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <Input name="cmDepartureDate" label="Departure date *" type="date" required />
              <Input name="cmReturnDate" label="Return date" type="date" />
            </div>
            {multiStopEnabled && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-zinc-700">Trip shape *</label>
                  <select
                    value={tripShape}
                    onChange={(e) =>
                      setTripShape(
                        e.target.value === "round_trip"
                          ? "round_trip"
                          : e.target.value === "multi_stop"
                            ? "multi_stop"
                            : "one_way"
                      )
                    }
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="one_way">One-way</option>
                    <option value="round_trip">Round trip</option>
                    <option value="multi_stop">Multi-stop</option>
                  </select>
                </div>
                {tripShape !== "one_way" && (
                  <Input
                    label="Route origin (for return leg)"
                    value={routeOrigin}
                    onChange={(e) => setRouteOrigin(e.target.value)}
                    placeholder="HQ"
                  />
                )}
              </div>
            )}
            {multiStopEnabled && tripShape !== "one_way" && (
              <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/20 p-4">
                <p className="text-xs font-medium text-zinc-500 uppercase">Planned stops</p>
                {routeStops.map((stop, idx) => (
                  <div key={idx} className="grid gap-2 sm:grid-cols-5 items-end">
                    <select
                      value={stop.location}
                      onChange={(e) => updateRouteStop(idx, "location", e.target.value)}
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Stop location…</option>
                      {siteRows.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code} — {s.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      label="Load out"
                      value={stop.loadOut}
                      onChange={(e) => updateRouteStop(idx, "loadOut", e.target.value)}
                    />
                    <Input
                      label="Load in"
                      value={stop.loadIn}
                      onChange={(e) => updateRouteStop(idx, "loadIn", e.target.value)}
                    />
                    <Input
                      label="Stop notes"
                      value={stop.notes}
                      onChange={(e) => updateRouteStop(idx, "notes", e.target.value)}
                    />
                    <div className="flex gap-2">
                      {routeStops.length > 1 && (
                        <Button type="button" variant="outline" size="sm" onClick={() => removeRouteStop(idx)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addRouteStop}>
                  + Add stop
                </Button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="cmCrewSize" label="Crew size *" type="number" min={1} step={1} required placeholder="Number of people on this mission" />
              <Input name="cmPassengers" label="Passenger names / notes" placeholder="Optional — names or notes" />
              <Input name="cmLoadout" label="Loadout / equipment" placeholder="Cargo summary for the mission" />
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={publicTransport}
                onChange={(e) => setPublicTransport(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="font-medium text-amber-900">Team travelling by public transport</span>
                <span className="block text-xs text-amber-800">
                  Use when no company vehicle is available and the team will deploy by public
                  transport (e.g. taxi / bus). Requires management approval and a written
                  justification. Vehicle allocation, DVC and trip-readiness gates are skipped.
                </span>
              </span>
            </label>
            {publicTransport && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700">
                  Public-transport justification *
                </label>
                <textarea
                  value={publicTransportJustification}
                  onChange={(e) => setPublicTransportJustification(e.target.value)}
                  placeholder="e.g. No 4WD vehicles available for the Maseru–Mokhotlong route on this date; team to deploy via shared taxi."
                  rows={3}
                  maxLength={1000}
                  className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                />
                <p className="text-xs text-zinc-500">
                  Minimum 20 characters. This is audited and visible to approvers.
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700">Mission profile *</label>
                <select
                  name="cmMissionProfile"
                  required
                  defaultValue="local"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {MISSION_PROFILE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500">Local affects pre-trip readiness rules vs field deployments.</p>
              </div>
              <div className={`flex flex-col gap-1.5 ${publicTransport ? "opacity-50" : ""}`}>
                <label className="text-sm font-medium text-zinc-700">
                  Vehicle type needed {publicTransport ? "" : "*"}
                </label>
                <select
                  name="cmRequiredVehicleClass"
                  disabled={publicTransport}
                  required={!publicTransport}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                >
                  <option value="" disabled>
                    {publicTransport ? "Not required (public transport)" : "Select type…"}
                  </option>
                  {(Object.values(ASSET_CLASS) as AssetClass[]).map((c) => (
                    <option key={c} value={c}>
                      {ASSET_CLASS_LABELS[c]}
                    </option>
                  ))}
                </select>
                {publicTransport && (
                  <p className="text-xs text-zinc-500">
                    Skipped — no company vehicle on this mission.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700">R&amp;R status</label>
                <select
                  name="cmRrStatus"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  defaultValue="na"
                >
                  <option value="na">N/A — not applicable</option>
                  <option value="pending">Pending — clearance required</option>
                </select>
              </div>
            </div>
            <Input name="cmNotes" label="Mission notes" placeholder="Optional" />
            {missionMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {missionMessage}
              </div>
            )}
            {draftMissions.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 space-y-2">
                <div className="text-sm font-medium text-blue-900">Mission drafts</div>
                <p className="text-xs text-blue-800">
                  Drafts are private to creator + admin + IT and auto-expire after 30 days if not submitted.
                </p>
                <div className="space-y-2">
                  {draftMissions.map((m) => (
                    <div key={m.id} className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-zinc-900 truncate">
                          {(m.title?.trim() || m.destination).slice(0, 120)}
                        </div>
                        <div className="text-xs text-zinc-600">
                          {m.destination || "—"} · {m.departure_date || "—"}
                          {m.updated_at ? ` · Updated ${new Date(m.updated_at).toLocaleString()}` : ""}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => loadMissionDraftIntoForm(m)}>
                          {editingMissionDraftId === m.id ? "Editing" : "Edit draft"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="bg-blue-700 hover:bg-blue-800"
                          onClick={() => void submitDraftMissionNow(m.id)}
                        >
                          Submit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {revisionRequestedMissions.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
                <div className="text-sm font-medium text-amber-900">
                  Revisions requested on your mission submissions
                </div>
                <p className="text-xs text-amber-800">
                  Management sent these back for updates. Apply requested edits, then click
                  <strong> Resubmit</strong>.
                </p>
                <div className="space-y-2">
                  {revisionRequestedMissions.map((m) => (
                    <div key={m.id} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm">
                      <div className="font-medium text-zinc-900">
                        {(m.title?.trim() || m.destination).slice(0, 120)}
                      </div>
                      <div className="text-xs text-zinc-600">
                        {m.destination} · {m.departure_date}
                        {m.return_date ? ` → ${m.return_date}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-amber-900 whitespace-pre-wrap">
                        <span className="font-medium">Revision feedback: </span>
                        {m.rejection_reason || "See approver comments."}
                      </div>
                      <div className="mt-2">
                        <MissionApprovalTimeline mission={m} />
                      </div>
                      <div className="mt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-amber-300 text-amber-900"
                          onClick={() => void resubmitMissionForApproval(m.id)}
                        >
                          Resubmit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {missionFormError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{missionFormError}</div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                name="intent"
                value="saveDraft"
                variant="outline"
                disabled={missionSubmitting}
                size="lg"
                className="touch-manipulation"
              >
                {missionSubmitting ? "Saving…" : editingMissionDraftId ? "Update draft" : "Save draft"}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="submit"
                disabled={missionSubmitting}
                size="lg"
                className="touch-manipulation"
              >
                {missionSubmitting ? "Submitting…" : editingMissionDraftId ? "Submit draft for approval" : "Submit mission for approval"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-emerald-200">
        <CardHeader>
          <CardTitle className="text-base">2. Driver logistics request (EHS approved drivers)</CardTitle>
          <p className="text-sm text-zinc-600 font-normal">
            Links an approved mission to a pool queue row (purpose, priority, notes). Required vehicle class is taken from the mission when set; fleet reserves a specific vehicle on the mission after line approval.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleVehicleRequest(e)} className="space-y-4">
            <EhsCompliantDriverPickerField
              organizationId={organizationId}
              value={designatedOperator}
              onChange={setDesignatedOperator}
              required
              disabled={managerOverrideReady}
              helperText="The list is scoped to your current organisation (country). Only fully compliant on-road operators appear. Pick the person who will drive; this links the request to the canonical EHS row."
            />
            {managerOverrideReady && (
              <p className="text-xs text-amber-800 rounded-md border border-amber-100 bg-amber-50/80 px-2 py-1.5">
                Manager override is active — driver selection is optional if you are bypassing the EHS gate. The request will still be logged.
              </p>
            )}
            <div className="max-w-xl">
                <EntityPickerField
                  label="Approved mission"
                  required
                  value={selectedMissionId}
                  onChange={setSelectedMissionId}
                  modalTitle="Pick an approved mission"
                  modalDescription="Only management-approved missions are listed. Create one above and wait for approval if you don't see it."
                  searchPlaceholder="Search by title, destination, dates…"
                  placeholder={missionsLoading ? "Loading…" : "Select an approved mission…"}
                  loading={missionsLoading}
                  showCount
                  options={approvedMissions.map<EntityPickerOption>((m) => ({
                    value: m.id,
                    label: (m.title?.trim() || m.destination).slice(0, 96),
                    description: `${m.destination}${m.departure_date ? ` · ${m.departure_date}` : ""}${
                      m.return_date ? ` → ${m.return_date}` : ""
                    }`,
                    meta: m.required_vehicle_class ? `Class: ${m.required_vehicle_class}` : "Approved",
                    metaTone: "success",
                    searchTokens: [
                      m.title,
                      m.destination,
                      m.departure_date,
                      m.return_date,
                      m.required_vehicle_class ?? "",
                      m.mission_profile ?? "",
                      m.trip_shape ?? "",
                      missionRouteSummary(m),
                    ],
                  }))}
                  emptyState={
                    <span>
                      No approved missions yet. Submit one in step 1 and wait for management approval.
                    </span>
                  }
                />
                {!missionsLoading && approvedMissions.length === 0 && (
                  <p className="text-xs text-amber-800 mt-1">
                    No approved missions yet. Create a mission above and wait for management approval.
                  </p>
                )}
              </div>
              {selectedMission && (
                <div className="text-sm text-zinc-700 rounded-md border border-zinc-200 bg-zinc-50/80 px-3 py-2">
                  <span className="text-zinc-500">Mission: </span>
                  {selectedMission.destination} · {selectedMission.departure_date}
                  <span className="ml-2 text-zinc-500">· {tripShapeLabel(selectedMission.trip_shape)}</span>
                  <div className="text-xs text-zinc-600 mt-1">
                    <span className="font-medium">Route:</span> {missionRouteSummary(selectedMission)}
                  </div>
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
                {!selectedMission?.required_vehicle_class?.trim() ? (
                  <Select name="requiredVehicleClass" label="Vehicle type needed *" required>
                    <option value="" disabled>
                      Select type…
                    </option>
                    {(Object.values(ASSET_CLASS) as AssetClass[]).map((c) => (
                      <option key={c} value={c}>
                        {ASSET_CLASS_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-700">
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Vehicle class (from mission)</span>
                    <div className="font-medium text-zinc-900 mt-0.5">
                      {ASSET_CLASS_LABELS[selectedMission.required_vehicle_class as AssetClass] ??
                        selectedMission.required_vehicle_class}
                    </div>
                    <input type="hidden" name="requiredVehicleClass" value={selectedMission.required_vehicle_class} />
                  </div>
                )}
                <Input name="loadoutDescription" label="Loadout / equipment" placeholder="For this vehicle request" />
              </div>
              <div className="max-w-md">
                <Select name="rrStatus" label="R&amp;R status (rest &amp; recuperation)">
                  <option value="na">N/A — not applicable</option>
                  <option value="pending">Pending — R&amp;R clearance required</option>
                </Select>
              </div>
              <Input name="notes" label="Notes" placeholder="Additional information" />
              {canOverride && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideEnabled}
                      onChange={(e) => setOverrideEnabled(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium text-amber-900">
                        Manager / approver override
                      </span>
                      <span className="block text-xs text-amber-800">
                        Bypass the EHS-approved-driver gate or the approved-mission requirement.
                        Use sparingly. Override and reason are logged with this request.
                      </span>
                    </span>
                  </label>
                  {overrideEnabled && (
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      rows={2}
                      placeholder="Why are you bypassing? (e.g. urgent maintenance run, driver newly approved offline, mission still pending sign-off but field-critical, etc.)"
                      className="w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    />
                  )}
                  {overrideEnabled && overrideReason.trim().length > 0 && overrideReason.trim().length < 8 && (
                    <p className="text-xs text-amber-700">Reason needs at least 8 characters.</p>
                  )}
                </div>
              )}
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
        </CardContent>
      </Card>
    </div>
  );
}
