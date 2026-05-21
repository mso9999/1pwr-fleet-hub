"use client";

import { useEffect, useState, use, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { VehicleStatusBadge } from "@/components/StatusBadge";
import {
  VEHICLE_STATUS,
  VEHICLE_STATUSES_REQUIRING_OPEN_WO,
  VEHICLE_STATUSES_REQUIRING_SIGNOFF,
  OPEN_WORK_ORDER_STATUSES_FOR_VEHICLE_RULE,
  ASSET_CLASS,
  ASSET_CLASS_LABELS,
  TRACKER_STATUS,
  assetClassLabel,
} from "@/types";
import type { VehicleStatus, AssetClass, TrackerStatus } from "@/types";
import { canSignOffVehicleStatus } from "@/lib/fleet-roles";
import { MediaUpload } from "@/components/MediaUpload";
import { VehicleDashboardTabs } from "@/components/VehicleDashboardTabs";
import { CreateWorkOrderForm } from "@/components/CreateWorkOrderForm";
import { PriorityBadge } from "@/components/StatusBadge";
import type { WorkOrderPriority } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { VehicleCountryChangeDialog } from "@/components/VehicleCountryChangeDialog";

interface VehicleDetail {
  id: string;
  organization_id: string;
  code: string;
  make: string;
  model: string;
  year: number | null;
  license_plate: string;
  vin: string;
  engine_number: string;
  asset_class: AssetClass;
  home_location: string;
  current_location: string;
  status: VehicleStatus;
  date_in_service: string;
  notes: string;
  tracker_imei: string;
  tracker_provider: string;
  tracker_sim: string;
  tracker_model: string;
  tracker_install_date: string;
  tracker_status: TrackerStatus;
  registration_disc_expiry_date?: string | null;
  created_at: string;
  updated_at: string;
  created_by_id?: string;
  created_by_name?: string;
  updated_by_id?: string;
  updated_by_name?: string;
}

interface TrackingReport {
  id: string;
  vehicle_code: string;
  report_date: string;
  period_start: string;
  period_end: string;
  total_distance_km: number;
  total_trips: number;
  total_driving_hours: number;
  total_idle_hours: number;
  max_speed_kmh: number;
  avg_speed_kmh: number;
  geofence_violations: number;
  harsh_braking_events: number;
  harsh_acceleration_events: number;
  after_hours_usage_minutes: number;
  fuel_consumed_liters: number;
  start_location: string;
  end_location: string;
  report_source: string;
  notes: string;
}

const TRACKER_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-zinc-100 text-zinc-600",
  "no-signal": "bg-red-100 text-red-800",
  "not-installed": "bg-zinc-100 text-zinc-400",
  unknown: "bg-yellow-100 text-yellow-800",
};

const WO_STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  queued: "bg-indigo-100 text-indigo-800",
  "in-progress": "bg-amber-100 text-amber-800",
  "needs-parts": "bg-orange-100 text-orange-900",
  "pr-submitted": "bg-violet-100 text-violet-900",
  "awaiting-parts": "bg-red-100 text-red-800",
  completed: "bg-emerald-100 text-emerald-800",
  closed: "bg-zinc-200 text-zinc-700",
  "return-repair": "bg-orange-100 text-orange-800",
  cancelled: "bg-zinc-100 text-zinc-500",
  rejected: "bg-red-200 text-red-900",
};

interface VehicleWorkOrderRow {
  id: string;
  title: string;
  status: string;
  priority: WorkOrderPriority;
  assigned_to: string;
  total_cost: number;
  downtime_start: string;
  downtime_end: string | null;
  completed_at: string | null;
  created_at: string;
}

type WoSortKey = "completed_at" | "created_at" | "status" | "priority" | "title" | "total_cost";
type WoSortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const WO_OPEN_STATUSES = new Set(OPEN_WORK_ORDER_STATUSES_FOR_VEHICLE_RULE);

const PAGE_SIZE = 10;

interface CountryReqRow {
  id: string;
  status: string;
  change_kind: string;
  to_organization_id: string;
  created_at: string;
}

interface SortableHeaderProps {
  label: string;
  sortKey: WoSortKey;
  current: WoSortKey;
  dir: WoSortDir;
  onToggle: (key: WoSortKey) => void;
  className?: string;
}

function SortableHeader({
  label,
  sortKey,
  current,
  dir,
  onToggle,
  className,
}: SortableHeaderProps): React.ReactElement {
  const active = current === sortKey;
  const indicator = active ? (dir === "asc" ? "▲" : "▼") : "";
  return (
    <th className={`px-3 py-2 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`flex items-center gap-1 ${active ? "text-zinc-900" : "text-zinc-500"} hover:text-zinc-900`}
      >
        <span>{label}</span>
        <span className="text-[10px]">{indicator}</span>
      </button>
    </th>
  );
}

function buildVehicleWorkOrderRemarks(v: VehicleDetail): string {
  const lines = [
    `Vehicle: ${v.code} — ${v.make} ${v.model}${v.year ? ` (${v.year})` : ""}`,
    v.license_plate ? `License plate: ${v.license_plate}` : null,
    v.vin ? `VIN: ${v.vin}` : null,
    `Engine: ${v.engine_number || "—"}`,
    `Home / current location: ${v.home_location} / ${v.current_location}`,
    `Asset class: ${v.asset_class}`,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }): React.ReactElement {
  const { id } = use(params);
  const router = useRouter();
  const { organizationId, user } = useAuth();
  const canSignOff = canSignOffVehicleStatus(user?.role ?? "");
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingTracker, setIsEditingTracker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<TrackingReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState("");
  const [workOrders, setWorkOrders] = useState<VehicleWorkOrderRow[]>([]);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(false);
  const [showCreateWorkOrder, setShowCreateWorkOrder] = useState(false);
  const [woSortKey, setWoSortKey] = useState<WoSortKey>("completed_at");
  const [woSortDir, setWoSortDir] = useState<WoSortDir>("desc");
  const [woPage, setWoPage] = useState(0);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; country: string }>>([]);
  const [countryChangeRequests, setCountryChangeRequests] = useState<CountryReqRow[]>([]);
  const [showCountryDialog, setShowCountryDialog] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [needsWoPrompt, setNeedsWoPrompt] = useState<{ targetStatus: VehicleStatus } | null>(null);
  const [signoffDialog, setSignoffDialog] = useState<
    { targetStatus: VehicleStatus; reason: string } | null
  >(null);
  const [signoffSubmitting, setSignoffSubmitting] = useState(false);

  const hasOpenWorkOrder = workOrders.some((wo) => WO_OPEN_STATUSES.has(wo.status));

  const sortedWorkOrders = useMemo(() => {
    const arr = [...workOrders];
    const dir = woSortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      // Open WOs are pinned to the top regardless of sort direction (they have no
      // completion date and are the most actionable).
      const openA = WO_OPEN_STATUSES.has(a.status) ? 0 : 1;
      const openB = WO_OPEN_STATUSES.has(b.status) ? 0 : 1;
      if (openA !== openB) return openA - openB;

      let av: number | string | null = null;
      let bv: number | string | null = null;
      switch (woSortKey) {
        case "completed_at":
          av = a.completed_at;
          bv = b.completed_at;
          break;
        case "created_at":
          av = a.created_at;
          bv = b.created_at;
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "priority":
          av = PRIORITY_ORDER[a.priority] ?? 99;
          bv = PRIORITY_ORDER[b.priority] ?? 99;
          break;
        case "title":
          av = a.title.toLowerCase();
          bv = b.title.toLowerCase();
          break;
        case "total_cost":
          av = a.total_cost;
          bv = b.total_cost;
          break;
      }
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // nulls last
      if (bv === null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [workOrders, woSortKey, woSortDir]);

  const woPageCount = Math.max(1, Math.ceil(sortedWorkOrders.length / PAGE_SIZE));
  const safePage = Math.min(woPage, woPageCount - 1);
  const pagedWorkOrders = sortedWorkOrders.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  function toggleSort(key: WoSortKey): void {
    if (woSortKey === key) {
      setWoSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setWoSortKey(key);
      setWoSortDir(key === "title" || key === "status" ? "asc" : "desc");
    }
    setWoPage(0);
  }

  const loadCountryChangeRequests = useCallback(() => {
    void (async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setCountryChangeRequests([]);
        return;
      }
      try {
        const r = await fetch(`/api/vehicles/${id}/country-change-requests`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        setCountryChangeRequests(Array.isArray(d) ? (d as CountryReqRow[]) : []);
      } catch {
        setCountryChangeRequests([]);
      }
    })();
  }, [id]);

  const loadWorkOrders = useCallback(() => {
    setWorkOrdersLoading(true);
    const params = new URLSearchParams();
    params.set("org", organizationId);
    params.set("vehicleId", id);
    params.set("sort", "completed");
    fetch(`/api/work-orders?${params}`)
      .then((r) => r.json())
      .then((d: unknown) => {
        setWorkOrders(Array.isArray(d) ? (d as VehicleWorkOrderRow[]) : []);
        setWorkOrdersLoading(false);
      })
      .catch(() => {
        setWorkOrders([]);
        setWorkOrdersLoading(false);
      });
  }, [id, organizationId]);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => r.json())
      .then((d: unknown) => {
        setOrganizations(Array.isArray(d) ? (d as typeof organizations) : []);
      })
      .catch(() => setOrganizations([]));
  }, []);

  useEffect(() => {
    loadCountryChangeRequests();
  }, [loadCountryChangeRequests]);

  useEffect(() => {
    fetch(`/api/vehicles/${id}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setVehicle(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    if (!vehicle) return;
    setIsLoadingReports(true);
    fetch(`/api/vehicles/${id}/tracking-reports?limit=30`)
      .then((r) => r.json())
      .then((d) => { setReports(d); setIsLoadingReports(false); })
      .catch(() => setIsLoadingReports(false));
  }, [id, vehicle]);

  async function patchStatus(
    newStatus: VehicleStatus,
    extras: { signoffReason?: string } = {},
  ): Promise<{ ok: boolean; error?: string; reason?: string; suggestedStatus?: string }> {
    const payload: Record<string, unknown> = { status: newStatus };
    if (extras.signoffReason) payload.signoffReason = extras.signoffReason;
    const res = await fetch(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated = await res.json();
      setVehicle(updated);
      setStatusError(null);
      return { ok: true };
    }
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      reason?: string;
      suggestedStatus?: string;
    };
    setStatusError(data.error || "Status change failed.");
    return { ok: false, ...data };
  }

  async function handleStatusChange(newStatus: VehicleStatus): Promise<void> {
    setStatusError(null);

    if (VEHICLE_STATUSES_REQUIRING_SIGNOFF.includes(newStatus)) {
      if (!canSignOff) {
        setStatusError(
          "Marking a vehicle written-off requires management sign-off. Ask an admin / fleet management / executive / finance / superadmin to apply this change."
        );
        return;
      }
      setSignoffDialog({ targetStatus: newStatus, reason: "" });
      return;
    }

    const result = await patchStatus(newStatus);
    if (!result.ok && result.reason === "needs_open_work_order") {
      setNeedsWoPrompt({ targetStatus: newStatus });
    }
  }

  async function confirmSignoff(): Promise<void> {
    if (!signoffDialog) return;
    const reason = signoffDialog.reason.trim();
    if (reason.length < 8) return;
    setSignoffSubmitting(true);
    const result = await patchStatus(signoffDialog.targetStatus, { signoffReason: reason });
    setSignoffSubmitting(false);
    if (result.ok) setSignoffDialog(null);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      code: fd.get("code"),
      make: fd.get("make"),
      model: fd.get("model"),
      year: fd.get("year") ? Number(fd.get("year")) : null,
      licensePlate: fd.get("licensePlate"),
      vin: fd.get("vin"),
      engineNumber: fd.get("engineNumber"),
      assetClass: fd.get("assetClass"),
      homeLocation: fd.get("homeLocation"),
      notes: fd.get("notes"),
      registrationDiscExpiryDate: fd.get("registrationDiscExpiryDate") || "",
    };

    const res = await fetch(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setVehicle(updated);
      setIsEditing(false);
    }
  }

  async function handleTrackerSave(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      trackerImei: fd.get("trackerImei"),
      trackerProvider: fd.get("trackerProvider"),
      trackerSim: fd.get("trackerSim"),
      trackerModel: fd.get("trackerModel"),
      trackerInstallDate: fd.get("trackerInstallDate"),
      trackerStatus: fd.get("trackerStatus"),
    };

    const res = await fetch(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setVehicle(updated);
      setIsEditingTracker(false);
    }
  }

  async function handleGenerateReport(): Promise<void> {
    setIsGenerating(true);
    setGenerateMsg("");
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch("/api/tracking-reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: id, reportDate: today, periodStart: today, periodEnd: today }),
    });
    const data = await res.json();
    if (res.ok) {
      setGenerateMsg(`Generated ${data.generated} report(s)`);
      const rRes = await fetch(`/api/vehicles/${id}/tracking-reports?limit=30`);
      if (rRes.ok) setReports(await rRes.json());
    } else {
      setGenerateMsg(data.error || "Failed to generate");
    }
    setIsGenerating(false);
  }

  if (isLoading) return <div className="text-zinc-500 text-center py-12">Loading...</div>;
  if (!vehicle) return <div className="text-red-500 text-center py-12">Vehicle not found</div>;

  const hasTracker = vehicle.tracker_imei && vehicle.tracker_imei.length > 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => router.push("/vehicles")}>← Back</Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{vehicle.code}</h2>
          <p className="text-sm text-zinc-500">{vehicle.make} {vehicle.model} {vehicle.year || ""}</p>
          {(vehicle.created_by_name || vehicle.updated_by_name) && (
            <p className="text-xs text-zinc-400 mt-1">
              {vehicle.created_by_name
                ? `Added by ${vehicle.created_by_name}`
                : null}
              {vehicle.created_by_name && vehicle.updated_by_name ? " · " : null}
              {vehicle.updated_by_name
                ? `Last edited by ${vehicle.updated_by_name}`
                : null}
            </p>
          )}
        </div>
        <VehicleStatusBadge status={vehicle.status} />
      </div>

      {VEHICLE_STATUSES_REQUIRING_OPEN_WO.includes(vehicle.status) && !workOrdersLoading && !hasOpenWorkOrder && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">
            Status is <strong>{vehicle.status}</strong> but there is no open work order.
          </p>
          <p className="mt-1 text-amber-800">
            This combination is no longer allowed. Either create a work order specifying the parts /
            assignee, or set the status to <strong>diagnosis</strong> while the issue is still being
            investigated.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowCreateWorkOrder(true);
                if (typeof window !== "undefined") {
                  setTimeout(() => {
                    document
                      .querySelector<HTMLElement>('[data-tutorial="tutorial-wo-create-form"]')
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 50);
                }
              }}
            >
              Create work order
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleStatusChange(VEHICLE_STATUS.DIAGNOSIS)}
            >
              Set status to diagnosis
            </Button>
          </div>
        </div>
      )}

      <VehicleDashboardTabs vehicleId={vehicle.id} vehicleCode={vehicle.code} />

      <Card data-tutorial="tutorial-vehicle-country-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Country / organization</CardTitle>
            <span data-tutorial="tutorial-vehicle-country-request-btn">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCountryDialog(true)}>
                Request change…
              </Button>
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <span className="text-zinc-500">Registered to: </span>
            <span className="font-medium text-zinc-900">
              {organizations.find((o) => o.id === vehicle.organization_id)?.name || vehicle.organization_id}
            </span>
            <span className="text-zinc-500">
              {" "}
              (
              {organizations.find((o) => o.id === vehicle.organization_id)?.country || "—"})
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Use <strong>Request change</strong> to fix a wrong country on create, or to record a secondment or permanent
            transfer (with mission, mechanical inspection, and executive approval as required).
          </p>
          {countryChangeRequests.filter((r) => r.status === "pending_fleet" || r.status === "pending_executive").length >
            0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Pending country change request(s). Approvers can review on the{" "}
              <button
                type="button"
                className="text-amber-950 underline font-medium"
                onClick={() => router.push("/vehicle-country-changes")}
              >
                Country transfers
              </button>{" "}
              page.
            </div>
          )}
        </CardContent>
      </Card>

      <VehicleCountryChangeDialog
        open={showCountryDialog}
        onClose={() => setShowCountryDialog(false)}
        vehicleId={vehicle.id}
        vehicleCode={vehicle.code}
        fromOrganizationId={vehicle.organization_id}
        fromOrganizationName={
          organizations.find((o) => o.id === vehicle.organization_id)?.name || vehicle.organization_id
        }
        onSubmitted={() => {
          loadCountryChangeRequests();
          fetch(`/api/vehicles/${id}`)
            .then((r) => {
              if (!r.ok) throw new Error();
              return r.json();
            })
            .then((d) => setVehicle(d))
            .catch(() => {});
        }}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Work orders</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateWorkOrder((s) => !s)}>
              {showCreateWorkOrder ? "Cancel" : "+ New work order"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showCreateWorkOrder && (
            <CreateWorkOrderForm
              vehicles={[{ id: vehicle.id, code: vehicle.code, make: vehicle.make, model: vehicle.model }]}
              organizationId={organizationId}
              defaultVehicleId={vehicle.id}
              lockVehicle
              defaultRemarks={buildVehicleWorkOrderRemarks(vehicle)}
              onCreated={() => {
                setShowCreateWorkOrder(false);
                loadWorkOrders();
              }}
              onCancel={() => setShowCreateWorkOrder(false)}
            />
          )}
          {workOrdersLoading ? (
            <p className="text-sm text-zinc-500">Loading work orders…</p>
          ) : workOrders.length === 0 ? (
            <p className="text-sm text-zinc-500">No work orders for this vehicle yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <SortableHeader label="Title" sortKey="title" current={woSortKey} dir={woSortDir} onToggle={toggleSort} />
                      <SortableHeader label="Status" sortKey="status" current={woSortKey} dir={woSortDir} onToggle={toggleSort} />
                      <SortableHeader label="Priority" sortKey="priority" current={woSortKey} dir={woSortDir} onToggle={toggleSort} />
                      <th className="px-3 py-2 hidden md:table-cell">Assigned</th>
                      <SortableHeader label="Cost" sortKey="total_cost" current={woSortKey} dir={woSortDir} onToggle={toggleSort} className="hidden lg:table-cell" />
                      <SortableHeader label="Created" sortKey="created_at" current={woSortKey} dir={woSortDir} onToggle={toggleSort} className="hidden lg:table-cell" />
                      <SortableHeader label="Date completed" sortKey="completed_at" current={woSortKey} dir={woSortDir} onToggle={toggleSort} />
                      <th className="px-3 py-2"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {pagedWorkOrders.map((wo) => {
                      const isOpen = WO_OPEN_STATUSES.has(wo.status);
                      return (
                        <tr key={wo.id} className="hover:bg-zinc-50/80">
                          <td className="px-3 py-2 align-top">
                            <div className="font-medium text-zinc-900">{wo.title}</div>
                            {isOpen ? (
                              <span className="text-[10px] uppercase tracking-wide text-emerald-700">open</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${WO_STATUS_COLORS[wo.status] || "bg-zinc-100 text-zinc-700"}`}>
                              {wo.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <PriorityBadge priority={wo.priority} />
                          </td>
                          <td className="px-3 py-2 align-top hidden md:table-cell text-zinc-700">
                            {wo.assigned_to || "—"}
                          </td>
                          <td className="px-3 py-2 align-top hidden lg:table-cell text-zinc-700">
                            {wo.total_cost > 0 ? `R ${wo.total_cost.toFixed(0)}` : "—"}
                          </td>
                          <td className="px-3 py-2 align-top hidden lg:table-cell text-zinc-500">
                            {new Date(wo.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 align-top text-zinc-500">
                            {wo.completed_at ? new Date(wo.completed_at).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/work-orders?open=${wo.id}`)}
                            >
                              Open
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {woPageCount > 1 ? (
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    Page {safePage + 1} of {woPageCount} · {sortedWorkOrders.length} work orders
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWoPage((p) => Math.max(0, p - 1))}
                      disabled={safePage === 0}
                    >
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWoPage((p) => Math.min(woPageCount - 1, p + 1))}
                      disabled={safePage >= woPageCount - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-tutorial="tutorial-vehicle-status-change">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Quick Status Change</CardTitle>
          </div>
          <p className="text-sm text-zinc-500 font-normal">
            Set the vehicle&rsquo;s operational status. <strong>deployed</strong> flips automatically
            when a trip starts and back to <strong>operational</strong> on check-in.
            <strong> diagnosis</strong> is the pre-WO investigation state.
            <strong> maintenance-hq</strong>, <strong>maintenance-3rdparty</strong>,
            <strong> awaiting-parts</strong>, and <strong>grounded</strong> require at least one
            open work order (submitted through in-progress, needs-parts, PR submitted, or awaiting-parts). <strong>written-off</strong> requires
            management sign-off (admin / fleet management / executive / finance / superadmin).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.values(VEHICLE_STATUS).map((s) => {
              const requiresOpenWo = VEHICLE_STATUSES_REQUIRING_OPEN_WO.includes(s);
              const requiresSignoff = VEHICLE_STATUSES_REQUIRING_SIGNOFF.includes(s);
              const blockedNoWo = requiresOpenWo && !hasOpenWorkOrder && vehicle.status !== s;
              const blockedSignoff = requiresSignoff && !canSignOff;
              const disabled = vehicle.status === s || blockedSignoff;
              const title = blockedSignoff
                ? "Requires management sign-off"
                : blockedNoWo
                  ? "Open a work order first, or set diagnosis"
                  : undefined;
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={vehicle.status === s ? "default" : "outline"}
                  onClick={() => void handleStatusChange(s)}
                  disabled={disabled}
                  title={title}
                  className={blockedNoWo ? "opacity-70" : undefined}
                >
                  {s}
                  {requiresOpenWo ? <span className="ml-1 text-[10px] text-zinc-400">(needs WO)</span> : null}
                  {requiresSignoff ? <span className="ml-1 text-[10px] text-zinc-400">(sign-off)</span> : null}
                </Button>
              );
            })}
          </div>
          {statusError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {statusError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {needsWoPrompt ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setNeedsWoPrompt(null);
          }}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Open work order required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-zinc-700">
                Setting status to <strong>{needsWoPrompt.targetStatus}</strong> requires an open
                work order specifying the parts and assignee. Choose how to proceed:
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    setNeedsWoPrompt(null);
                    setShowCreateWorkOrder(true);
                    if (typeof window !== "undefined") {
                      setTimeout(() => {
                        document
                          .querySelector<HTMLElement>('[data-tutorial="tutorial-wo-create-form"]')
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 50);
                    }
                  }}
                >
                  Create a work order now
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const target = needsWoPrompt.targetStatus;
                    setNeedsWoPrompt(null);
                    await patchStatus(VEHICLE_STATUS.DIAGNOSIS);
                    void target;
                  }}
                >
                  Set status to diagnosis instead
                </Button>
                <Button variant="ghost" onClick={() => setNeedsWoPrompt(null)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {signoffDialog ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !signoffSubmitting) setSignoffDialog(null);
          }}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Management sign-off</CardTitle>
              <p className="text-sm text-zinc-500 font-normal">
                You are about to mark <strong>{vehicle.code}</strong> as
                {" "}
                <strong>{signoffDialog.targetStatus}</strong>. This requires a written sign-off
                reason that will be recorded against your account in the status history.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                rows={3}
                value={signoffDialog.reason}
                onChange={(e) =>
                  setSignoffDialog({ ...signoffDialog, reason: e.target.value })
                }
                placeholder="e.g. Vehicle declared a total loss after accident on 2026-04-22, scrap value LSL 25,000."
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              />
              {signoffDialog.reason.trim().length > 0 && signoffDialog.reason.trim().length < 8 ? (
                <p className="text-xs text-amber-700">Reason needs at least 8 characters.</p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSignoffDialog(null)}
                  disabled={signoffSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void confirmSignoff()}
                  disabled={signoffSubmitting || signoffDialog.reason.trim().length < 8}
                >
                  {signoffSubmitting ? "Signing off…" : "Confirm and sign off"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Vehicle Details</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
              {isEditing ? "Cancel" : "Edit"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              <Input name="code" label="Code" defaultValue={vehicle.code} required />
              <Input name="make" label="Make" defaultValue={vehicle.make} />
              <Input name="model" label="Model" defaultValue={vehicle.model} />
              <Input name="year" label="Year" type="number" defaultValue={vehicle.year?.toString() || ""} />
              <Input name="licensePlate" label="License Plate" defaultValue={vehicle.license_plate} />
              <Input name="vin" label="VIN" defaultValue={vehicle.vin} />
              <Input name="engineNumber" label="Engine Number" defaultValue={vehicle.engine_number} />
              <Select name="assetClass" label="Category" defaultValue={vehicle.asset_class}>
                {(Object.values(ASSET_CLASS) as AssetClass[]).map((c) => (
                  <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>
                ))}
              </Select>
              <Input name="homeLocation" label="Home Location" defaultValue={vehicle.home_location} />
              <Input
                name="registrationDiscExpiryDate"
                label="Registration disc expiry"
                type="date"
                defaultValue={(vehicle.registration_disc_expiry_date || "").slice(0, 10)}
              />
              <p className="text-xs text-zinc-500 sm:col-span-2 -mt-2">
                Road registration (window disc). Leave empty if not tracked. Missions cannot reserve past this date without a management override.
              </p>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-zinc-700">Notes</label>
                <textarea
                  name="notes"
                  defaultValue={vehicle.notes}
                  rows={3}
                  className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="Code" value={vehicle.code} />
              <InfoRow label="Make / Model" value={`${vehicle.make} ${vehicle.model}`} />
              <InfoRow label="Year" value={vehicle.year?.toString() || "—"} />
              <InfoRow label="License Plate" value={vehicle.license_plate || "—"} />
              <InfoRow label="VIN" value={vehicle.vin || "—"} />
              <InfoRow label="Engine Number" value={vehicle.engine_number || "—"} />
              <InfoRow label="Category" value={assetClassLabel(vehicle.asset_class)} />
              <InfoRow label="Home Location" value={vehicle.home_location} />
              <InfoRow
                label="Registration disc expiry"
                value={
                  vehicle.registration_disc_expiry_date
                    ? String(vehicle.registration_disc_expiry_date).slice(0, 10)
                    : "— (not tracked)"
                }
              />
              <InfoRow label="Current Location" value={vehicle.current_location} />
              <InfoRow label="Date in Service" value={vehicle.date_in_service || "—"} />
              {vehicle.notes && (
                <div className="sm:col-span-2">
                  <div className="text-xs font-medium text-zinc-500 uppercase">Notes</div>
                  <div className="mt-1 text-sm">{vehicle.notes}</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tracker Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>Tracker Info</CardTitle>
              {hasTracker && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TRACKER_STATUS_COLORS[vehicle.tracker_status] || TRACKER_STATUS_COLORS.unknown}`}>
                  {vehicle.tracker_status}
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsEditingTracker(!isEditingTracker)}>
              {isEditingTracker ? "Cancel" : hasTracker ? "Edit" : "Add Tracker"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isEditingTracker ? (
            <form onSubmit={handleTrackerSave} className="grid gap-4 sm:grid-cols-2">
              <Input name="trackerImei" label="IMEI Number" defaultValue={vehicle.tracker_imei} placeholder="e.g. 350612345678901" />
              <Input name="trackerProvider" label="Provider" defaultValue={vehicle.tracker_provider} placeholder="e.g. Ctrack, Netstar, MiX" />
              <Input name="trackerSim" label="SIM Number" defaultValue={vehicle.tracker_sim} placeholder="SIM card number" />
              <Input name="trackerModel" label="Device Model" defaultValue={vehicle.tracker_model} placeholder="e.g. GL300W" />
              <Input name="trackerInstallDate" label="Install Date" type="date" defaultValue={vehicle.tracker_install_date} />
              <Select name="trackerStatus" label="Tracker Status" defaultValue={vehicle.tracker_status}>
                {Object.values(TRACKER_STATUS).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
              <div className="sm:col-span-2">
                <Button type="submit">Save Tracker Info</Button>
              </div>
            </form>
          ) : hasTracker ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="IMEI" value={vehicle.tracker_imei} />
              <InfoRow label="Provider" value={vehicle.tracker_provider || "—"} />
              <InfoRow label="SIM Number" value={vehicle.tracker_sim || "—"} />
              <InfoRow label="Device Model" value={vehicle.tracker_model || "—"} />
              <InfoRow label="Install Date" value={vehicle.tracker_install_date || "—"} />
              <InfoRow label="Status" value={vehicle.tracker_status} />
            </div>
          ) : (
            <p className="text-sm text-zinc-400">No tracker assigned. Click &quot;Add Tracker&quot; to enter IMEI and provider details.</p>
          )}
        </CardContent>
      </Card>

      {/* Tracking Reports Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Tracking Reports</CardTitle>
            <div className="flex items-center gap-2">
              {generateMsg && <span className="text-xs text-zinc-500">{generateMsg}</span>}
              <Button variant="outline" size="sm" onClick={handleGenerateReport} disabled={isGenerating || !hasTracker || vehicle.tracker_status !== "active"}>
                {isGenerating ? "Generating..." : "Generate Today"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!hasTracker ? (
            <p className="text-sm text-zinc-400">Add a tracker to this vehicle to generate tracking reports.</p>
          ) : isLoadingReports ? (
            <p className="text-sm text-zinc-500">Loading reports...</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-zinc-400">No tracking reports yet. Click &quot;Generate Today&quot; to create one from trip data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-zinc-500 uppercase">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Distance</th>
                    <th className="pb-2 pr-4">Trips</th>
                    <th className="pb-2 pr-4">Driving Hrs</th>
                    <th className="pb-2 pr-4">Idle Hrs</th>
                    <th className="pb-2 pr-4">Max Speed</th>
                    <th className="pb-2 pr-4">Avg Speed</th>
                    <th className="pb-2 pr-4">Geofence</th>
                    <th className="pb-2 pr-4">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="py-2 pr-4 font-medium">{r.report_date}</td>
                      <td className="py-2 pr-4">{r.total_distance_km.toFixed(1)} km</td>
                      <td className="py-2 pr-4">{r.total_trips}</td>
                      <td className="py-2 pr-4">{r.total_driving_hours.toFixed(1)}</td>
                      <td className="py-2 pr-4">{r.total_idle_hours.toFixed(1)}</td>
                      <td className="py-2 pr-4">{r.max_speed_kmh > 0 ? `${r.max_speed_kmh.toFixed(0)} km/h` : "—"}</td>
                      <td className="py-2 pr-4">{r.avg_speed_kmh > 0 ? `${r.avg_speed_kmh.toFixed(0)} km/h` : "—"}</td>
                      <td className="py-2 pr-4">
                        {r.geofence_violations > 0 ? (
                          <span className="text-red-600 font-medium">{r.geofence_violations}</span>
                        ) : "0"}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${r.report_source === "auto-generated" ? "bg-blue-100 text-blue-700" : r.report_source === "tracker-api" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-600"}`}>
                          {r.report_source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Media Attachments */}
      <Card>
        <CardHeader>
          <CardTitle>Photos & Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <MediaUpload entityType="vehicle" entityId={id} />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <div className="text-xs font-medium text-zinc-500 uppercase">{label}</div>
      <div className="mt-1 text-sm font-medium capitalize">{value}</div>
    </div>
  );
}
