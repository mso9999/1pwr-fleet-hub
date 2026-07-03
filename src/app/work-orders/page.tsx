"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { WorkOrderStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { WORK_ORDER_STATUS, WORK_ORDER_PRIORITY, REPAIR_LOCATION } from "@/types";
import type { WorkOrderStatus, WorkOrderPriority } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { canAdvanceWorkOrderStatus } from "@/lib/fleet-roles";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { MediaUpload } from "@/components/MediaUpload";
import { mediaAttachmentFileUrl } from "@/lib/media-file-url";
import {
  CreateWorkOrderForm,
  WORK_ORDER_THIRD_PARTY_SHOPS,
  type VehicleOption,
} from "@/components/CreateWorkOrderForm";
import { AssigneeCombo } from "@/components/AssigneeCombo";
import { useFleetMechanicOptions } from "@/lib/useFleetMechanics";
import { useTutorial } from "@/components/tutorial/tutorial-context";
import { WORK_ORDER_VALID_TRANSITIONS } from "@/lib/work-order-transitions";

interface WorkOrderRow {
  id: string;
  organization_id?: string;
  vehicle_id: string;
  vehicle_code: string;
  vehicle_make: string;
  vehicle_model: string;
  title: string;
  description: string;
  type: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  assigned_to: string;
  repair_location: string;
  third_party_shop: string;
  remarks: string;
  total_labour_hours: number;
  parts_cost: number;
  labour_cost: number;
  third_party_cost: number;
  total_cost: number;
  downtime_start: string;
  downtime_end: string | null;
  created_at: string;
}

interface StatusHistoryEntry {
  id: number;
  from_status: string | null;
  to_status: string;
  changed_by_name: string;
  reason: string;
  changed_at: string;
}

interface LaborEntry {
  id: string;
  worker_name: string;
  role: string;
  hours: number;
  rate_per_hour: number;
  description: string;
  work_date: string;
}

interface POLinkEntry {
  id: string;
  pr_number: string;
  po_number: string;
  vendor: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
}

interface WorkOrderDetail extends WorkOrderRow {
  days_open: number;
  status_history: StatusHistoryEntry[];
  labor: LaborEntry[];
  po_links: POLinkEntry[];
  parts: Array<{ id: string; description: string; quantity: number; unit_cost: number; supplier: string; pr_status: string; delivery_eta?: string }>;
  closing_inspection_id?: string | null;
  pr_cache_by_number?: Record<string, { pr_status?: string | null; approved_amount?: number | null; currency?: string | null; description?: string | null }>;
  pr_system_base_url?: string;
}

const STATUS_COLORS: Record<string, string> = {
  "submitted": "bg-blue-100 text-blue-800",
  "queued": "bg-indigo-100 text-indigo-800",
  "in-progress": "bg-amber-100 text-amber-800",
  "needs-parts": "bg-orange-100 text-orange-900",
  "pr-submitted": "bg-violet-100 text-violet-900",
  "awaiting-parts": "bg-red-100 text-red-800",
  "completed": "bg-emerald-100 text-emerald-800",
  "closed": "bg-zinc-200 text-zinc-700",
  "return-repair": "bg-orange-100 text-orange-800",
  "cancelled": "bg-zinc-100 text-zinc-500",
  "rejected": "bg-red-200 text-red-900",
};

function WorkOrdersPageContent(): React.ReactElement {
  const { organizationId } = useAuth();
  const { active, trackId, stepIndex } = useTutorial();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<WorkOrderRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");

  useEffect(() => {
    const open = searchParams.get("open");
    if (open) setSelectedId(open);
  }, [searchParams]);

  useEffect(() => {
    if (!active || trackId !== "workOrder") return;
    setShowCreate(stepIndex === 2);
  }, [active, trackId, stepIndex]);

  const loadOrders = useCallback(() => {
    const params = new URLSearchParams();
    params.set("org", organizationId);
    if (filterStatus) params.set("status", filterStatus);
    fetch(`/api/work-orders?${params}`)
      .then((r) => r.json())
      .then((d) => { setOrders(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [filterStatus, organizationId]);

  useEffect(() => {
    loadOrders();
    fetch(`/api/vehicles?org=${organizationId}`).then((r) => r.json()).then(setVehicles).catch(() => {});
  }, [loadOrders, organizationId]);

  const activeStatuses = [
    "submitted",
    "queued",
    "in-progress",
    "needs-parts",
    "pr-submitted",
    "awaiting-parts",
    "return-repair",
  ];
  const doneStatuses = ["completed", "closed", "cancelled", "rejected"];
  const activeOrders = orders.filter((o) => activeStatuses.includes(o.status));
  const closedOrders = orders.filter((o) => doneStatuses.includes(o.status));

  // Status summary counts
  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Status summary bar */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(WORK_ORDER_STATUS).map(([, s]) => {
          const count = statusCounts[s] || 0;
          if (
            count === 0 &&
            !["submitted", "queued", "in-progress", "needs-parts", "pr-submitted", "awaiting-parts"].includes(s)
          )
            return null;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filterStatus === s ? "ring-2 ring-offset-1 ring-zinc-900" : ""
              } ${STATUS_COLORS[s] || "bg-zinc-100 text-zinc-600"}`}
            >
              {s} ({count})
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3" data-tutorial="tutorial-work-orders-header">
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">{activeOrders.length} active · {closedOrders.length} done</span>
          <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1 rounded-md ${viewMode === "list" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`px-2.5 py-1 rounded-md ${viewMode === "board" ? "bg-zinc-900 text-white" : "text-zinc-600"}`}
            >
              Board
            </button>
          </div>
        </div>
        <span data-tutorial="tutorial-work-orders-create-btn">
          <Button onClick={() => setShowCreate(!showCreate)}>+ New Work Order</Button>
        </span>
      </div>

      {showCreate && (
        <CreateWorkOrderForm
          vehicles={vehicles}
          organizationId={organizationId}
          onCreated={() => { setShowCreate(false); loadOrders(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {selectedId && (
        <WorkOrderDetailPanel
          workOrderId={selectedId}
          organizationId={organizationId}
          onClose={() => setSelectedId(null)}
          onUpdated={loadOrders}
        />
      )}

      {isLoading ? (
        <div className="text-zinc-500 text-center py-12">Loading...</div>
      ) : viewMode === "board" ? (
        <WorkOrderBoard orders={orders} onPick={(id) => setSelectedId(id)} />
      ) : (
        <div className="space-y-3">
          {activeOrders.map((wo) => (
            <WorkOrderListItem key={wo.id} order={wo} onClick={() => setSelectedId(wo.id)} />
          ))}
          {closedOrders.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-700">
                Completed / Closed / Cancelled ({closedOrders.length})
              </summary>
              <div className="mt-3 space-y-3">
                {closedOrders.map((wo) => (
                  <WorkOrderListItem key={wo.id} order={wo} onClick={() => setSelectedId(wo.id)} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkOrdersPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="text-zinc-500 text-center py-12">Loading...</div>}>
      <WorkOrdersPageContent />
    </Suspense>
  );
}

const BOARD_COLUMNS = [
  "submitted",
  "queued",
  "in-progress",
  "needs-parts",
  "pr-submitted",
  "awaiting-parts",
  "completed",
  "closed",
] as const;

function WorkOrderBoard({ orders, onPick }: { orders: WorkOrderRow[]; onPick: (id: string) => void }): React.ReactElement {
  const byStatus: Record<string, WorkOrderRow[]> = {};
  for (const o of orders) {
    const key = o.status || "submitted";
    (byStatus[key] ??= []).push(o);
  }
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 min-w-max pb-2">
        {BOARD_COLUMNS.map((col) => {
          const items = byStatus[col] || [];
          return (
            <div key={col} className="w-60 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[col] || "bg-zinc-100 text-zinc-600"}`}>
                  {col.replace(/-/g, " ")}
                </span>
                <span className="text-xs text-zinc-400">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((wo) => (
                  <button
                    key={wo.id}
                    type="button"
                    onClick={() => onPick(wo.id)}
                    className="w-full text-left rounded-lg border border-zinc-200 bg-white p-2.5 hover:border-blue-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">{wo.vehicle_code}</Badge>
                      <span className="text-xs text-zinc-400">{wo.priority}</span>
                    </div>
                    <div className="text-sm font-medium text-zinc-900 mt-1 line-clamp-2">{wo.title}</div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                      {wo.assigned_to ? `· ${wo.assigned_to}` : "· unassigned"}
                      {typeof wo.total_cost === "number" && wo.total_cost > 0 ? ` · R${wo.total_cost.toFixed(0)}` : ""}
                    </div>
                  </button>
                ))}
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-zinc-200 p-3 text-center text-[11px] text-zinc-400">
                    empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function workOrderDaysDown(downtimeStart: string, downtimeEnd: string | null): number | null {
  const startMs = new Date(downtimeStart).getTime();
  if (Number.isNaN(startMs)) return null;
  const endMs = downtimeEnd ? new Date(downtimeEnd).getTime() : Date.now();
  if (Number.isNaN(endMs)) return null;
  const days = (endMs - startMs) / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.ceil(days));
}

function WorkOrderListItem({ order, onClick }: { order: WorkOrderRow; onClick: () => void }): React.ReactElement {
  const daysDown = workOrderDaysDown(order.downtime_start, order.downtime_end);

  return (
    <Card className={`cursor-pointer hover:border-blue-200 transition-colors ${order.priority === "critical" ? "border-red-200" : ""}`} onClick={onClick}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Badge variant="secondary" className="text-base font-bold shrink-0">{order.vehicle_code}</Badge>
            <div className="min-w-0">
              <div className="font-medium truncate">{order.title}</div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || ""}`}>
                  {order.status}
                </span>
                <PriorityBadge priority={order.priority} />
                {order.assigned_to && <span className="text-xs text-zinc-500">· {order.assigned_to}</span>}
                {order.total_cost > 0 && <span className="text-xs text-zinc-500">· R{order.total_cost.toFixed(0)}</span>}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0 ml-3" title={daysDown != null ? "Days since downtime started (vehicle off the road)" : "Downtime start date missing or invalid"}>
            <div
              className={`text-lg font-bold ${
                daysDown == null
                  ? "text-zinc-400"
                  : daysDown > 14
                    ? "text-red-600"
                    : daysDown > 7
                      ? "text-amber-600"
                      : "text-zinc-600"
              }`}
            >
              {daysDown != null ? `${daysDown}d` : "—"}
            </div>
            <div className="text-xs text-zinc-400">downtime</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function WorkOrderDetailPanel({ workOrderId, onClose, onUpdated, organizationId }: {
  organizationId: string;
  workOrderId: string;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactElement {
  const { user } = useAuth();
  const canAdvanceStatus = canAdvanceWorkOrderStatus(user?.role ?? "", user?.department);
  const { names: mechanicOptions } = useFleetMechanicOptions(organizationId);
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [showAddPO, setShowAddPO] = useState(false);
  const [showAddPart, setShowAddPart] = useState(false);
  const [transitionReason, setTransitionReason] = useState("");
  const [closingInspectionId, setClosingInspectionId] = useState("");
  const [recentInspections, setRecentInspections] = useState<Array<{ id: string; type: string; created_at: string; overall_pass: number }>>([]);
  const [updates, setUpdates] = useState<Array<{ id: string; note: string; posted_by_name: string; has_photos: number; photo_count: number; created_at: string; photos: Array<{ id: string; file_name: string; entity_type: string; entity_id: string; mime_type: string }> }>>([]);
  const [showAddUpdate, setShowAddUpdate] = useState(false);
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);
  const updateFileRef = useRef<HTMLInputElement>(null);

  const loadDetail = useCallback(() => {
    fetch(`/api/work-orders/${workOrderId}`)
      .then((r) => r.json())
      .then((d) => { setDetail(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [workOrderId]);

  const loadUpdates = useCallback(() => {
    fetch(`/api/work-orders/${workOrderId}/updates`)
      .then((r) => r.json())
      .then(setUpdates)
      .catch(() => {});
  }, [workOrderId]);

  useEffect(() => { loadDetail(); loadUpdates(); }, [loadDetail, loadUpdates]);

  // When the work order is `completed` (i.e. `closed` is a valid next status),
  // load recent inspections for the vehicle so the user can attach a closing
  // inspection (the API requires it on completed -> closed).
  useEffect(() => {
    if (!detail || detail.status !== "completed") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/inspections?org=${encodeURIComponent(detail.organization_id || organizationId)}&vehicleId=${encodeURIComponent(detail.vehicle_id)}`);
        if (!res.ok) return;
        const rows = (await res.json()) as Array<{ id: string; type: string; created_at: string; overall_pass: number }>;
        if (!cancelled) setRecentInspections(Array.isArray(rows) ? rows.slice(0, 20) : []);
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [detail, organizationId]);

  async function transitionStatus(newStatus: string): Promise<void> {
    setError(null);
    const body: Record<string, unknown> = {
      status: newStatus,
      changedById: user?.id || "",
      changedByName: user?.name || "",
      reason: transitionReason || `Status changed to ${newStatus}`,
    };
    if (newStatus === "closed" && closingInspectionId) {
      body.closingInspectionId = closingInspectionId;
    }
    const res = await fetch(`/api/work-orders/${workOrderId}`, {
      method: "PATCH",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to update status");
      return;
    }
    setTransitionReason("");
    setClosingInspectionId("");
    loadDetail();
    onUpdated();
  }

  async function updateField(field: string, value: string): Promise<void> {
    await fetch(`/api/work-orders/${workOrderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    loadDetail();
    onUpdated();
  }

  async function addLabor(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/work-orders/${workOrderId}/labor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workerName: fd.get("workerName"),
        role: fd.get("role") || "mechanic",
        hours: parseFloat(fd.get("hours") as string) || 0,
        ratePerHour: parseFloat(fd.get("ratePerHour") as string) || 0,
        description: fd.get("description"),
        workDate: fd.get("workDate") || new Date().toISOString().split("T")[0],
      }),
    });
    setShowAddLabor(false);
    loadDetail();
    onUpdated();
  }

  async function addPOLink(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/work-orders/${workOrderId}/po-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prNumber: fd.get("prNumber"),
        poNumber: fd.get("poNumber"),
        vendor: fd.get("vendor"),
        description: fd.get("description"),
        amount: parseFloat(fd.get("amount") as string) || 0,
        status: fd.get("status") || "pending",
      }),
    });
    setShowAddPO(false);
    loadDetail();
    onUpdated();
  }

  async function addPart(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/work-orders/${workOrderId}/parts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: fd.get("description"),
        quantity: parseInt(fd.get("quantity") as string, 10) || 1,
        unitCost: parseFloat(fd.get("unitCost") as string) || 0,
        supplier: fd.get("supplier"),
        prStatus: fd.get("prStatus"),
        deliveryEta: fd.get("deliveryEta"),
      }),
    });
    if (res.ok) {
      setShowAddPart(false);
      loadDetail();
      onUpdated();
    }
  }

  async function removePart(partId: string): Promise<void> {
    if (!confirm("Remove this part line?")) return;
    const res = await fetch(`/api/work-orders/${workOrderId}/parts?partId=${encodeURIComponent(partId)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      loadDetail();
      onUpdated();
    }
  }

  async function postUpdate(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setIsPostingUpdate(true);
    const fd = new FormData(e.currentTarget);
    fd.set("postedById", user?.id || "");
    fd.set("postedByName", user?.name || user?.email || "");
    fd.set("updateType", "progress");
    const photos = updateFileRef.current?.files;
    if (photos) {
      for (const f of Array.from(photos)) fd.append("photos", f as Blob);
    }
    const res = await fetch(`/api/work-orders/${workOrderId}/updates`, { method: "POST", body: fd });
    if (res.ok) {
      setShowAddUpdate(false);
      (e.target as HTMLFormElement).reset();
      loadUpdates();
    }
    setIsPostingUpdate(false);
  }

  if (isLoading) return <Card><CardContent className="p-8 text-center text-zinc-500">Loading work order...</CardContent></Card>;
  if (!detail) return <Card><CardContent className="p-8 text-center text-red-500">Work order not found</CardContent></Card>;

  const allowedTransitions = WORK_ORDER_VALID_TRANSITIONS[detail.status] || [];

  return (
    <Card className="border-blue-200 bg-blue-50/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-lg font-bold">{detail.vehicle_code}</Badge>
            <div>
              <CardTitle className="text-lg">{detail.title}</CardTitle>
              <div className="text-sm text-zinc-500">{detail.vehicle_make} {detail.vehicle_model} · {detail.type}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

        {/* Status + Days Open + Cost */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-white border p-3">
            <div className="text-xs text-zinc-500">Status</div>
            <div className={`inline-block mt-1 px-2 py-0.5 rounded-full text-sm font-medium ${STATUS_COLORS[detail.status] || ""}`}>
              {detail.status}
            </div>
          </div>
          <div className="rounded-lg bg-white border p-3">
            <div className="text-xs text-zinc-500">Days Open</div>
            <div className={`text-2xl font-bold ${detail.days_open > 14 ? "text-red-600" : detail.days_open > 7 ? "text-amber-600" : "text-zinc-800"}`}>
              {detail.days_open}
            </div>
          </div>
          <div className="rounded-lg bg-white border p-3">
            <div className="text-xs text-zinc-500">Labour Hours</div>
            <div className="text-2xl font-bold text-zinc-800">{(detail.total_labour_hours || 0).toFixed(1)}h</div>
          </div>
          <div className="rounded-lg bg-white border p-3">
            <div className="text-xs text-zinc-500">Total Cost</div>
            <div className="text-2xl font-bold text-zinc-800">R{(detail.total_cost || 0).toFixed(0)}</div>
            {(detail.parts_cost > 0 || detail.labour_cost > 0 || detail.third_party_cost > 0) && (
              <div className="text-xs text-zinc-400 mt-0.5">
                Parts R{detail.parts_cost.toFixed(0)} · Labour R{detail.labour_cost.toFixed(0)} · 3rd party R{detail.third_party_cost.toFixed(0)}
              </div>
            )}
          </div>
        </div>

        {/* Status Transition Buttons */}
        {allowedTransitions.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-500 uppercase">Advance Status</div>
            {canAdvanceStatus ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {allowedTransitions.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === "cancelled" || s === "rejected" ? "outline" : "default"}
                      className={s === "closed" ? "bg-emerald-700 hover:bg-emerald-800" : s === "cancelled" ? "text-zinc-500" : ""}
                      onClick={() => transitionStatus(s)}
                    >
                      → {s}
                    </Button>
                  ))}
                </div>
                {allowedTransitions.includes("closed") && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
                    <div className="text-xs font-medium text-emerald-900">
                      Closing inspection required to close this work order.
                    </div>
                    <select
                      value={closingInspectionId}
                      onChange={(e) => setClosingInspectionId(e.target.value)}
                      className="h-9 w-full max-w-md rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                    >
                      <option value="">Select a recent inspection for this vehicle…</option>
                      {recentInspections.map((insp) => (
                        <option key={insp.id} value={insp.id}>
                          {insp.type} · {insp.created_at?.slice(0, 10)} · {insp.overall_pass === 1 ? "pass" : "fail"}
                        </option>
                      ))}
                    </select>
                    {!closingInspectionId && (
                      <p className="text-[11px] text-amber-800">
                        Pick an inspection above before clicking <strong>→ closed</strong>, or record a
                        closing inspection on the Inspections page first.
                      </p>
                    )}
                  </div>
                )}
                <Input
                  placeholder="Reason for status change (optional)"
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  className="max-w-md"
                />
              </>
            ) : (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Only staff with a <strong>Fleet</strong> department in People Resources (or superadmins) can change work order status. Ask your fleet coordinator if a transition is needed.
              </p>
            )}
          </div>
        )}

        {/* Edit fields */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Priority" value={detail.priority} onChange={(e) => updateField("priority", e.target.value)}>
            {Object.values(WORK_ORDER_PRIORITY).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
          <AssigneeCombo
            label="Assigned To"
            value={detail.assigned_to || ""}
            onChange={(v) => updateField("assignedTo", v)}
            options={mechanicOptions}
            otherPlaceholder="Type mechanic name"
          />
          <Select label="Repair Location" value={detail.repair_location} onChange={(e) => updateField("repairLocation", e.target.value)}>
            {Object.values(REPAIR_LOCATION).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
          {detail.repair_location === "3rd-party" && (
            <Select label="3rd Party Shop" value={detail.third_party_shop} onChange={(e) => updateField("thirdPartyShop", e.target.value)}>
              <option value="">Select shop...</option>
              {WORK_ORDER_THIRD_PARTY_SHOPS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          )}
        </div>

        {detail.description && (
          <div>
            <div className="text-xs font-medium text-zinc-500 uppercase">Description</div>
            <div className="mt-1 text-sm whitespace-pre-wrap">{detail.description}</div>
          </div>
        )}

        {/* Status History Timeline */}
        <div>
          <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Status History</div>
          <div className="space-y-1">
            {detail.status_history.map((h) => (
              <div key={h.id} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-400 w-28 shrink-0">{new Date(h.changed_at).toLocaleDateString()} {new Date(h.changed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[h.to_status] || "bg-zinc-100"}`}>{h.to_status}</span>
                {h.from_status && <span className="text-zinc-400">from {h.from_status}</span>}
                {h.changed_by_name && <span className="text-zinc-500">by {h.changed_by_name}</span>}
                {h.reason && <span className="text-zinc-400 italic">— {h.reason}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Labor Log */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-zinc-500 uppercase">Labour Log ({detail.labor.length} entries · {(detail.total_labour_hours || 0).toFixed(1)}h total)</div>
            <Button size="sm" variant="outline" onClick={() => setShowAddLabor(!showAddLabor)}>+ Add Labour</Button>
          </div>
          {showAddLabor && (
            <LaborEntryForm
              onSubmit={addLabor}
              onCancel={() => setShowAddLabor(false)}
              mechanics={mechanicOptions}
            />
          )}
          {detail.labor.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Date</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Worker</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Hours</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Cost</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.labor.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2 text-zinc-500">{l.work_date}</td>
                      <td className="px-3 py-2 font-medium">{l.worker_name}</td>
                      <td className="px-3 py-2 text-right">{l.hours}h</td>
                      <td className="px-3 py-2 text-right">R{(l.hours * l.rate_per_hour).toFixed(0)}</td>
                      <td className="px-3 py-2 text-zinc-500 truncate max-w-[200px]">{l.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Parts */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-zinc-500 uppercase">Parts ({detail.parts.length})</div>
            <Button size="sm" variant="outline" onClick={() => setShowAddPart(!showAddPart)}>+ Add part</Button>
          </div>
          {showAddPart && (
            <form onSubmit={addPart} className="grid gap-2 sm:grid-cols-4 mb-3 p-3 bg-white rounded-lg border">
              <Input name="description" label="Part / description" placeholder="What was replaced" className="sm:col-span-2" required />
              <Input name="quantity" label="Qty" type="number" min={1} step={1} defaultValue={1} />
              <Input name="unitCost" label="Unit cost (LSL)" type="number" step="0.01" placeholder="0" />
              <Input name="supplier" label="Supplier" placeholder="Vendor name" />
              <Select name="prStatus" label="PR status" defaultValue="needed">
                <option value="needed">Needed</option>
                <option value="ordered">Ordered</option>
                <option value="received">Received</option>
                <option value="n/a">N/A</option>
              </Select>
              <Input name="deliveryEta" label="Delivery ETA" type="date" />
              <div className="flex items-end gap-1 sm:col-span-2">
                <Button type="submit" size="sm">Add</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowAddPart(false)}>✕</Button>
              </div>
            </form>
          )}
          {detail.parts.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Part</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Qty</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Unit Cost</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">PR Status</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">ETA</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.parts.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">{p.description}</td>
                      <td className="px-3 py-2 text-right">{p.quantity}</td>
                      <td className="px-3 py-2 text-right">R{(p.unit_cost || 0).toFixed(0)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs capitalize">{p.pr_status}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">{p.delivery_eta || "—"}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          aria-label="Remove part"
                          onClick={() => void removePart(p.id)}
                          className="text-zinc-400 hover:text-red-600 text-xs"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* PO Links */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-zinc-500 uppercase">PR/PO Links ({detail.po_links.length})</div>
            <Button size="sm" variant="outline" onClick={() => setShowAddPO(!showAddPO)}>+ Link PR/PO</Button>
          </div>
          {showAddPO && (
            <form onSubmit={addPOLink} className="grid gap-2 sm:grid-cols-4 mb-3 p-3 bg-white rounded-lg border">
              <Input name="prNumber" label="PR Number" placeholder="PR-2026-001" />
              <Input name="poNumber" label="PO Number" placeholder="PO-2026-001" />
              <Input name="vendor" label="Vendor" placeholder="Supplier name" />
              <Input name="amount" label="Amount (LSL)" type="number" step="0.01" placeholder="0" />
              <Input name="description" label="Description" placeholder="What was purchased" className="sm:col-span-3" />
              <div className="flex items-end gap-1">
                <Button type="submit" size="sm">Link</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowAddPO(false)}>✕</Button>
              </div>
              <input type="hidden" name="status" value="pending" />
            </form>
          )}
          {detail.po_links.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">PR #</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">PO #</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Vendor</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Amount</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Link status</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">PR approval</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.po_links.map((po) => {
                    const cache = detail.pr_cache_by_number?.[po.pr_number || ""];
                    const prBaseUrl = detail.pr_system_base_url || "https://pr.1pwrafrica.com";
                    return (
                      <tr key={po.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-blue-600">
                          {po.pr_number ? (
                            <a href={`${prBaseUrl}/?pr=${encodeURIComponent(po.pr_number)}`} target="_blank" rel="noreferrer" className="hover:underline">
                              {po.pr_number}
                            </a>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono">{po.po_number || "—"}</td>
                        <td className="px-3 py-2">{po.vendor || "—"}</td>
                        <td className="px-3 py-2 text-right">R{po.amount.toFixed(0)}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-xs capitalize">{po.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {cache?.pr_status ? (
                            <span className="capitalize">
                              {cache.pr_status}
                              {cache.approved_amount != null ? ` · R${Number(cache.approved_amount).toFixed(0)}` : ""}
                            </span>
                          ) : (
                            <span className="text-zinc-400">not synced</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {po.pr_number && (
                            <a
                              href={`${prBaseUrl}/?pr=${encodeURIComponent(po.pr_number)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-blue-600 hover:underline whitespace-nowrap"
                            >
                              Open in PR →
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Media Attachments */}
        <div>
          <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Photos & Documents</div>
          <MediaUpload entityType="work_order" entityId={detail.id} />
        </div>

        {/* Progress Updates */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-zinc-500 uppercase">Progress Updates ({updates.length})</div>
            <Button size="sm" variant="outline" onClick={() => setShowAddUpdate(!showAddUpdate)}>
              {showAddUpdate ? "Cancel" : "+ Post Update"}
            </Button>
          </div>

          {showAddUpdate && (
            <form onSubmit={postUpdate} className="border rounded-lg p-3 mb-3 bg-amber-50/50 space-y-3">
              <div>
                <label className="text-sm font-medium text-zinc-700">What&apos;s the progress?</label>
                <textarea
                  name="note"
                  required
                  rows={2}
                  className="mt-1 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                  placeholder="e.g. Removed gearbox, found worn clutch plate. Waiting for parts."
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => updateFileRef.current?.click()}>
                  <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Add Photos
                </Button>
                <input ref={updateFileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" />
                <Button type="submit" size="sm" disabled={isPostingUpdate}>
                  {isPostingUpdate ? "Posting..." : "Post Update"}
                </Button>
              </div>
              <p className="text-xs text-zinc-400">Tip: Upload photos of work progress to keep the team informed!</p>
            </form>
          )}

          {!showAddUpdate && updates.length === 0 && (
            <div className="border border-dashed rounded-lg p-4 text-center">
              <p className="text-sm text-zinc-500">No progress updates yet.</p>
              <p className="text-xs text-zinc-400 mt-1">Post updates with photos to track work progress!</p>
            </div>
          )}

          {updates.length > 0 && (
            <div className="space-y-3">
              {updates.map((u) => (
                <div key={u.id} className="border-l-2 border-blue-300 pl-3 py-1">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="font-medium text-zinc-600">{u.posted_by_name || "Unknown"}</span>
                    <span>{new Date(u.created_at).toLocaleString()}</span>
                    {u.photo_count > 0 && <span className="text-blue-500">📷 {u.photo_count}</span>}
                  </div>
                  <p className="text-sm text-zinc-700 mt-0.5">{u.note}</p>
                  {u.photos && u.photos.length > 0 && (
                    <div className="flex gap-1.5 mt-1.5 overflow-x-auto">
                      {u.photos.filter((p) => p.mime_type.startsWith("image/")).map((p) => (
                        <img
                          key={p.id}
                          src={mediaAttachmentFileUrl({
                            entity_type: p.entity_type,
                            entity_id: p.entity_id,
                            file_name: p.file_name,
                          })}
                          alt=""
                          className="w-20 h-20 rounded-lg object-cover border border-zinc-200"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-xs text-zinc-400 pt-2 border-t">
          Created: {new Date(detail.created_at).toLocaleDateString()} · Downtime: {new Date(detail.downtime_start).toLocaleDateString()}
          {detail.downtime_end && ` — ${new Date(detail.downtime_end).toLocaleDateString()}`}
        </div>
      </CardContent>
    </Card>
  );
}

function LaborEntryForm({
  onSubmit,
  onCancel,
  mechanics,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  onCancel: () => void;
  mechanics: string[];
}): React.ReactElement {
  const [workerName, setWorkerName] = useState("");
  return (
    <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-5 mb-3 p-3 bg-white rounded-lg border">
      <AssigneeCombo
        name="workerName"
        label="Worker"
        value={workerName}
        onChange={setWorkerName}
        options={mechanics}
        allowEmpty={false}
        required
        otherPlaceholder="Type mechanic name"
      />
      <Input name="hours" label="Hours" type="number" step="0.5" min="0" required placeholder="8" />
      <Input name="ratePerHour" label="Rate/hr (LSL)" type="number" step="1" placeholder="0" />
      <Input name="workDate" label="Date" type="date" defaultValue={new Date().toISOString().split("T")[0]} />
      <div className="flex items-end gap-1">
        <Button type="submit" size="sm">Add</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>✕</Button>
      </div>
      <Input name="description" label="Work Description" placeholder="What was done" className="sm:col-span-5" />
      <input type="hidden" name="role" value="mechanic" />
    </form>
  );
}
