"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { ASSET_CLASS, ASSET_CLASS_LABELS, type AssetClass } from "@/types";

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
}

interface PoolVehicle {
  id: string;
  code: string;
  make: string;
  model: string;
  pool: string;
  current_location: string;
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

interface RefRow {
  code: string;
  label: string;
  active: number;
}

export default function VehicleRequestsPage() {
  const { organizationId, user } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [pool, setPool] = useState<PoolData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"requests" | "pool">("requests");

  const isManager = user && (user.role === "fleet_lead" || user.role === "manager" || user.role === "admin");

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
            {pool && <span> · {pool.availableCount} vehicles available</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-zinc-200 overflow-hidden">
            <button
              onClick={() => setView("requests")}
              className={`px-4 py-2 text-sm font-medium ${view === "requests" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
            >
              Requests
            </button>
            <button
              onClick={() => setView("pool")}
              className={`px-4 py-2 text-sm font-medium border-l border-zinc-200 ${view === "pool" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
            >
              Vehicle Pool
            </button>
          </div>
          <Button onClick={() => { setShowForm(!showForm); setView("requests"); }} size="lg" className="touch-manipulation min-h-[48px]">
            + Request vehicle
          </Button>
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
      ) : view === "pool" && pool ? (
        <PoolView pool={pool} onAssigned={loadData} />
      ) : requests.length === 0 ? (
        <div className="text-zinc-500 text-center py-12">No vehicle requests yet.</div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
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
  );
}

function RequestCard({
  request: r,
  isManager,
  pool,
  organizationId,
  approverName,
  onUpdated,
}: {
  request: RequestRow;
  isManager: boolean;
  pool: PoolData | null;
  organizationId: string;
  approverName: string;
  onUpdated: () => void;
}) {
  const [isActing, setIsActing] = useState(false);
  const [assignVehicleId, setAssignVehicleId] = useState("");

  async function updateStatus(status: string, extra?: Record<string, string>) {
    setIsActing(true);
    await fetch(`/api/vehicle-requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: assignVehicleId, approvedByName: approverName }),
    });
    setIsActing(false);
    onUpdated();
  }

  const availableVehicles = pool?.pools
    ? Object.values(pool.pools).flat()
    : [];

  return (
    <Card className={r.status === "requested" ? "border-amber-200" : ""}>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-medium">{r.purpose || "Vehicle request"}</div>
            <div className="text-xs text-zinc-500 mt-0.5">
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-600">
          {r.destination && <div>Destination: <strong>{r.destination}</strong></div>}
          {r.departure_date && <div>Depart: <strong>{r.departure_date}</strong></div>}
          {r.return_date && <div>Return: <strong>{r.return_date}</strong></div>}
          {r.required_vehicle_class && <div>Class: <strong>{r.required_vehicle_class}</strong></div>}
          {r.passengers && <div>Passengers: <strong>{r.passengers}</strong></div>}
        </div>

        {r.assigned_vehicle_code && (
          <div className="text-sm text-emerald-700 font-medium">
            Assigned: {r.assigned_vehicle_code} — {r.assigned_vehicle_make} {r.assigned_vehicle_model}
          </div>
        )}

        {r.rejection_reason && (
          <div className="text-sm text-red-700">Rejected: {r.rejection_reason}</div>
        )}

        {isManager && r.status === "requested" && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-100">
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
          <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-100 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-zinc-600 block mb-1">Assign vehicle</label>
              <select
                value={assignVehicleId}
                onChange={(e) => setAssignVehicleId(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 px-2 text-sm"
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

function PoolView({ pool, onAssigned }: { pool: PoolData; onAssigned: () => void }) {
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

      {/* Pool groups */}
      {Object.entries(pool.pools).map(([poolName, vehicles]) => (
        <Card key={poolName}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base capitalize">{poolName} pool ({vehicles.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {vehicles.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2">
                  <div>
                    <span className="font-bold text-sm">{v.code}</span>
                    <span className="text-xs text-zinc-500 ml-2">{v.make} {v.model}</span>
                  </div>
                  <Badge variant="success" className="text-[10px]">{v.current_location}</Badge>
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
      headers: { "Content-Type": "application/json" },
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
    <Card className="border-emerald-200">
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
