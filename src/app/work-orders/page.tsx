"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { WorkOrderStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { WORK_ORDER_STATUS, WORK_ORDER_TYPE, WORK_ORDER_PRIORITY, REPAIR_LOCATION } from "@/types";
import type { WorkOrderStatus, WorkOrderPriority } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { MediaUpload } from "@/components/MediaUpload";

interface WorkOrderRow {
  id: string;
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
  parts: Array<{ id: string; description: string; quantity: number; unit_cost: number; supplier: string; pr_status: string }>;
}

interface VehicleOption {
  id: string;
  code: string;
  make: string;
  model: string;
}

const MECHANICS = ["Tebesi", "Kola", "Thene", "Molefe", "Khanare", "Seutloali", "Kubutu"];
const THIRD_PARTY_SHOPS = ["BFN", "Delter", "ECU Express Germiston", "John Williams", "Midas", "Lesotho Nissan", "Selematsela", "KET"];

const VALID_TRANSITIONS: Record<string, string[]> = {
  "submitted": ["queued", "rejected", "cancelled"],
  "queued": ["in-progress", "cancelled"],
  "in-progress": ["awaiting-parts", "completed", "cancelled"],
  "awaiting-parts": ["in-progress", "cancelled"],
  "completed": ["closed", "return-repair", "rejected"],
  "closed": ["return-repair"],
  "return-repair": ["queued", "in-progress"],
  "cancelled": [],
  "rejected": ["submitted"],
};

const STATUS_COLORS: Record<string, string> = {
  "submitted": "bg-blue-100 text-blue-800",
  "queued": "bg-indigo-100 text-indigo-800",
  "in-progress": "bg-amber-100 text-amber-800",
  "awaiting-parts": "bg-red-100 text-red-800",
  "completed": "bg-emerald-100 text-emerald-800",
  "closed": "bg-zinc-200 text-zinc-700",
  "return-repair": "bg-orange-100 text-orange-800",
  "cancelled": "bg-zinc-100 text-zinc-500",
  "rejected": "bg-red-200 text-red-900",
};

export default function WorkOrdersPage(): React.ReactElement {
  const { organizationId } = useAuth();
  const [orders, setOrders] = useState<WorkOrderRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const activeStatuses = ["submitted", "queued", "in-progress", "awaiting-parts", "return-repair"];
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
          if (count === 0 && !["submitted", "queued", "in-progress", "awaiting-parts"].includes(s)) return null;
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-zinc-500">{activeOrders.length} active · {closedOrders.length} done</span>
        <Button onClick={() => setShowCreate(!showCreate)}>+ New Work Order</Button>
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
          onClose={() => setSelectedId(null)}
          onUpdated={loadOrders}
        />
      )}

      {isLoading ? (
        <div className="text-zinc-500 text-center py-12">Loading...</div>
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

function WorkOrderListItem({ order, onClick }: { order: WorkOrderRow; onClick: () => void }): React.ReactElement {
  const daysDown = Math.max(1, Math.ceil(
    ((order.downtime_end ? new Date(order.downtime_end).getTime() : Date.now()) - new Date(order.downtime_start).getTime()) / (1000 * 60 * 60 * 24)
  ));

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
          <div className="text-right shrink-0 ml-3">
            <div className={`text-lg font-bold ${daysDown > 14 ? "text-red-600" : daysDown > 7 ? "text-amber-600" : "text-zinc-600"}`}>
              {daysDown}d
            </div>
            <div className="text-xs text-zinc-400">open</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function WorkOrderDetailPanel({ workOrderId, onClose, onUpdated }: {
  workOrderId: string;
  onClose: () => void;
  onUpdated: () => void;
}): React.ReactElement {
  const { user } = useAuth();
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [showAddPO, setShowAddPO] = useState(false);
  const [transitionReason, setTransitionReason] = useState("");
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

  async function transitionStatus(newStatus: string): Promise<void> {
    setError(null);
    const res = await fetch(`/api/work-orders/${workOrderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        changedById: user?.id || "",
        changedByName: user?.name || "",
        reason: transitionReason || `Status changed to ${newStatus}`,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to update status");
      return;
    }
    setTransitionReason("");
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

  const allowedTransitions = VALID_TRANSITIONS[detail.status] || [];

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
            <Input
              placeholder="Reason for status change (optional)"
              value={transitionReason}
              onChange={(e) => setTransitionReason(e.target.value)}
              className="max-w-md"
            />
          </div>
        )}

        {/* Edit fields */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Priority" value={detail.priority} onChange={(e) => updateField("priority", e.target.value)}>
            {Object.values(WORK_ORDER_PRIORITY).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
          <Select label="Assigned To" value={detail.assigned_to} onChange={(e) => updateField("assignedTo", e.target.value)}>
            <option value="">Unassigned</option>
            {MECHANICS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          <Select label="Repair Location" value={detail.repair_location} onChange={(e) => updateField("repairLocation", e.target.value)}>
            {Object.values(REPAIR_LOCATION).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
          {detail.repair_location === "3rd-party" && (
            <Select label="3rd Party Shop" value={detail.third_party_shop} onChange={(e) => updateField("thirdPartyShop", e.target.value)}>
              <option value="">Select shop...</option>
              {THIRD_PARTY_SHOPS.map((s) => (
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
            <form onSubmit={addLabor} className="grid gap-2 sm:grid-cols-5 mb-3 p-3 bg-white rounded-lg border">
              <Select name="workerName" label="Worker" required>
                <option value="">Select...</option>
                {MECHANICS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
              <Input name="hours" label="Hours" type="number" step="0.5" min="0" required placeholder="8" />
              <Input name="ratePerHour" label="Rate/hr (LSL)" type="number" step="1" placeholder="0" />
              <Input name="workDate" label="Date" type="date" defaultValue={new Date().toISOString().split("T")[0]} />
              <div className="flex items-end gap-1">
                <Button type="submit" size="sm">Add</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowAddLabor(false)}>✕</Button>
              </div>
              <Input name="description" label="Work Description" placeholder="What was done" className="sm:col-span-5" />
              <input type="hidden" name="role" value="mechanic" />
            </form>
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
        {detail.parts.length > 0 && (
          <div>
            <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Parts ({detail.parts.length})</div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Part</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Qty</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500">Unit Cost</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">PR Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.parts.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">{p.description}</td>
                      <td className="px-3 py-2 text-right">{p.quantity}</td>
                      <td className="px-3 py-2 text-right">R{(p.unit_cost || 0).toFixed(0)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">{p.pr_status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
                    <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.po_links.map((po) => (
                    <tr key={po.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-blue-600">{po.pr_number || "—"}</td>
                      <td className="px-3 py-2 font-mono">{po.po_number || "—"}</td>
                      <td className="px-3 py-2">{po.vendor || "—"}</td>
                      <td className="px-3 py-2 text-right">R{po.amount.toFixed(0)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">{po.status}</Badge>
                      </td>
                    </tr>
                  ))}
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
                          src={`/uploads/${p.entity_type}/${p.entity_id}/${p.file_name}`}
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

function CreateWorkOrderForm({ vehicles, organizationId, onCreated, onCancel }: {
  vehicles: VehicleOption[];
  organizationId: string;
  onCreated: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [repairLoc, setRepairLoc] = useState("hq");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      organizationId,
      vehicleId: fd.get("vehicleId"),
      title: fd.get("title"),
      description: fd.get("description"),
      type: fd.get("type"),
      priority: fd.get("priority"),
      assignedTo: fd.get("assignedTo"),
      repairLocation: fd.get("repairLocation"),
      thirdPartyShop: fd.get("thirdPartyShop") || "",
      remarks: fd.get("remarks"),
      reportedBy: user?.name || "",
      reportedById: user?.id || "",
    };

    const res = await fetch("/api/work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onCreated();
    else setIsSubmitting(false);
  }

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader><CardTitle>New Work Order</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <Select name="vehicleId" label="Vehicle *" required>
            <option value="">Select vehicle...</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.code} — {v.make} {v.model}</option>
            ))}
          </Select>
          <Input name="title" label="Title *" required placeholder="e.g. Engine rebuild" />
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-zinc-700">Description</label>
            <textarea
              name="description"
              rows={2}
              className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              placeholder="Detailed description of the issue and work needed"
            />
          </div>
          <Select name="type" label="Type *" required>
            {Object.values(WORK_ORDER_TYPE).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Select name="priority" label="Priority *" required>
            {Object.values(WORK_ORDER_PRIORITY).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
          <Select name="assignedTo" label="Assign To">
            <option value="">Unassigned</option>
            {MECHANICS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          <Select name="repairLocation" label="Repair Location" value={repairLoc} onChange={(e) => setRepairLoc(e.target.value)}>
            {Object.values(REPAIR_LOCATION).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
          {repairLoc === "3rd-party" && (
            <Select name="thirdPartyShop" label="3rd Party Shop">
              <option value="">Select shop...</option>
              {THIRD_PARTY_SHOPS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          )}
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-zinc-700">Remarks</label>
            <textarea
              name="remarks"
              rows={2}
              className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
            />
          </div>
          <div className="sm:col-span-2 flex gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Work Order"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
