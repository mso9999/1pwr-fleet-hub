"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";

interface VehicleOption {
  id: string;
  code: string;
  make: string;
  model: string;
}

interface MaintenanceRow {
  id: string;
  vehicle_id: string;
  vehicle_code: string;
  vehicle_make: string;
  vehicle_model: string;
  current_mileage: number;
  maintenance_type: string;
  description: string;
  interval_km: number;
  interval_months: number;
  last_performed_date: string;
  last_performed_km: number;
  next_due_date: string;
  next_due_km: number;
  status: string;
  work_order_id: string | null;
  created_at: string;
}

const MAINTENANCE_TYPES = [
  { value: "oil-change", label: "Oil Change" },
  { value: "full-service", label: "Full Service" },
  { value: "tire-rotation", label: "Tire Rotation" },
  { value: "brake-service", label: "Brake Service" },
  { value: "transmission-service", label: "Transmission Service" },
  { value: "coolant-flush", label: "Coolant Flush" },
  { value: "air-filter", label: "Air Filter" },
  { value: "timing-belt", label: "Timing Belt" },
  { value: "other", label: "Other" },
];

export default function MaintenancePage() {
  const { organizationId } = useAuth();
  const [items, setItems] = useState<MaintenanceRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const loadItems = useCallback(() => {
    fetch(`/api/scheduled-maintenance?org=${organizationId}`)
      .then((r) => r.json())
      .then((d) => { setItems(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [organizationId]);

  useEffect(() => {
    loadItems();
    fetch(`/api/vehicles?org=${organizationId}`).then((r) => r.json()).then(setVehicles).catch(() => {});
  }, [loadItems, organizationId]);

  async function runOverdueCheck() {
    setCheckResult(null);
    const res = await fetch(`/api/scheduled-maintenance/check-overdue?org=${organizationId}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setCheckResult(`Scanned ${data.scanned} items: ${data.newlyOverdue} newly overdue, ${data.workOrdersCreated} work orders created.`);
      loadItems();
    }
  }

  const overdueCount = items.filter((i) => i.status === "overdue").length;
  const upcomingCount = items.filter((i) => i.status === "upcoming").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            {items.length} scheduled maintenance entries
            {overdueCount > 0 && <span className="text-red-600 font-semibold"> · {overdueCount} overdue</span>}
            {upcomingCount > 0 && <span> · {upcomingCount} upcoming</span>}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            Track service intervals by mileage and time. Overdue items auto-create work orders.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void runOverdueCheck()} variant="outline" size="lg" className="touch-manipulation min-h-[48px]">
            Check overdue
          </Button>
          <Button onClick={() => setShowForm(!showForm)} size="lg" className="touch-manipulation min-h-[48px]">
            + Schedule maintenance
          </Button>
        </div>
      </div>

      {checkResult && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {checkResult}
        </div>
      )}

      {showForm && (
        <ScheduleForm
          vehicles={vehicles}
          organizationId={organizationId}
          onComplete={() => { setShowForm(false); loadItems(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <div className="text-zinc-500 text-center py-12">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-zinc-500 text-center py-12">No scheduled maintenance. Add one above.</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <MaintenanceCard key={item.id} item={item} onDeleted={loadItems} />
          ))}
        </div>
      )}
    </div>
  );
}

function MaintenanceCard({ item, onDeleted }: { item: MaintenanceRow; onDeleted: () => void }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const kmRemaining = item.next_due_km > 0 ? item.next_due_km - (item.current_mileage || 0) : null;
  const daysUntilDue = item.next_due_date
    ? Math.ceil((new Date(item.next_due_date).getTime() - Date.now()) / 86400000)
    : null;

  async function handleDelete() {
    if (!window.confirm("Delete this maintenance schedule?")) return;
    setIsDeleting(true);
    const res = await fetch(`/api/scheduled-maintenance/${item.id}`, { method: "DELETE" });
    setIsDeleting(false);
    if (res.ok) onDeleted();
  }

  return (
    <Card className={item.status === "overdue" ? "border-red-200" : ""}>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Badge variant="secondary" className="text-base font-bold shrink-0">{item.vehicle_code}</Badge>
            <div className="min-w-0">
              <div className="font-medium capitalize">{item.maintenance_type.replace(/-/g, " ")}</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Every {item.interval_km > 0 ? `${item.interval_km.toLocaleString()} km` : ""}
                {item.interval_km > 0 && item.interval_months > 0 ? " or " : ""}
                {item.interval_months > 0 ? `${item.interval_months} months` : ""}
                {item.description && <span> · {item.description}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {item.status === "overdue" && <Badge variant="destructive">Overdue</Badge>}
            {item.status === "upcoming" && <Badge variant="warning">Upcoming</Badge>}
            {item.status === "completed" && <Badge variant="success">Completed</Badge>}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-zinc-600">
          {item.next_due_km > 0 && (
            <div>
              Next at: <strong>{item.next_due_km.toLocaleString()} km</strong>
              {kmRemaining !== null && (
                <span className={kmRemaining <= 0 ? " text-red-600" : kmRemaining <= 500 ? " text-amber-600" : ""}>
                  {" "}({kmRemaining <= 0 ? "overdue" : `${kmRemaining.toLocaleString()} km left`})
                </span>
              )}
            </div>
          )}
          {item.next_due_date && (
            <div>
              Due: <strong>{item.next_due_date}</strong>
              {daysUntilDue !== null && (
                <span className={daysUntilDue <= 0 ? " text-red-600" : daysUntilDue <= 30 ? " text-amber-600" : ""}>
                  {" "}({daysUntilDue <= 0 ? "overdue" : `${daysUntilDue}d left`})
                </span>
              )}
            </div>
          )}
          {item.last_performed_km > 0 && (
            <div>Last at: {item.last_performed_km.toLocaleString()} km</div>
          )}
          {item.last_performed_date && (
            <div>Last on: {item.last_performed_date}</div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-zinc-100">
          {item.work_order_id && (
            <a href={`/work-orders`} className="text-xs text-blue-600 hover:underline self-center">
              View work order →
            </a>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50 touch-manipulation"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ScheduleForm({
  vehicles,
  organizationId,
  onComplete,
  onCancel,
}: {
  vehicles: VehicleOption[];
  organizationId: string;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    const fd = new FormData(e.currentTarget);

    if (!fd.get("vehicleId")) { setFormError("Select a vehicle."); return; }

    setIsSubmitting(true);
    const res = await fetch("/api/scheduled-maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        vehicleId: fd.get("vehicleId"),
        maintenanceType: fd.get("maintenanceType") || "full-service",
        description: fd.get("description") || "",
        intervalKm: parseInt(fd.get("intervalKm") as string, 10) || 10000,
        intervalMonths: parseInt(fd.get("intervalMonths") as string, 10) || 6,
        lastPerformedKm: parseInt(fd.get("lastPerformedKm") as string, 10) || 0,
        lastPerformedDate: fd.get("lastPerformedDate") || "",
      }),
    });

    setIsSubmitting(false);
    if (res.ok) { onComplete(); } else {
      const err = await res.json().catch(() => ({}));
      setFormError(err.error || "Failed to save.");
    }
  }

  return (
    <Card className="border-emerald-200">
      <CardHeader><CardTitle>Schedule Maintenance</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select name="vehicleId" label="Vehicle *" required>
              <option value="">Select vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.code} — {v.make} {v.model}</option>
              ))}
            </Select>
            <Select name="maintenanceType" label="Type *" required>
              {MAINTENANCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
            <Input name="description" label="Description" placeholder="Optional notes" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input name="intervalKm" label="Interval (km)" type="number" defaultValue="10000" />
            <Input name="intervalMonths" label="Interval (months)" type="number" defaultValue="6" />
            <Input name="lastPerformedKm" label="Last done at (km)" type="number" placeholder="0" />
            <Input name="lastPerformedDate" label="Last done on" type="date" />
          </div>
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</div>
          )}
          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting} size="lg" className="min-h-[48px] touch-manipulation">
              {isSubmitting ? "Saving…" : "Save schedule"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} size="lg" className="min-h-[48px]">Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
