"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InspectionRating } from "@/types";

export interface InspectionEditRow {
  id: string;
  vehicle_id: string;
  vehicle_code: string;
  vehicle_make: string;
  vehicle_model: string;
  inspector_name: string;
  type: string;
  items: Array<{ category: string; item: string; rating: InspectionRating; note: string }>;
  overall_pass: number;
  created_at: string;
  updated_at?: string;
}

interface VehicleOption {
  id: string;
  code: string;
  make: string;
  model: string;
}

interface Props {
  inspection: InspectionEditRow;
  vehicles: VehicleOption[];
  organizationId: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function InspectionEditForm({
  inspection,
  vehicles,
  organizationId,
  onSaved,
  onCancel,
}: Props): React.ReactElement {
  const [vehicleId, setVehicleId] = useState(inspection.vehicle_id);
  const [inspectorName, setInspectorName] = useState(inspection.inspector_name);
  const [items, setItems] = useState(() =>
    inspection.items.map((i) => ({
      category: i.category,
      item: i.item,
      rating: (["pass", "caution", "fail"].includes(i.rating) ? i.rating : "pass") as InspectionRating,
      note: i.note || "",
    }))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  function setRating(idx: number, rating: InspectionRating): void {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], rating };
      return next;
    });
  }

  function setNote(idx: number, note: string): void {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], note };
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    const res = await fetch(`/api/inspections/${inspection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        vehicleId,
        inspectorName,
        type: inspection.type,
        items,
      }),
    });
    setIsSubmitting(false);
    if (res.ok) onSaved();
    else {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error || "Save failed");
    }
  }

  const typeLabel =
    inspection.type === "driver-proficiency-2025"
      ? "1PWR checklist (2025)"
      : inspection.type.replace(/-/g, " ");

  return (
    <Card className="border-amber-200 shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Edit inspection</CardTitle>
        <p className="text-sm text-zinc-500 font-normal">
          {typeLabel} · {inspection.vehicle_code} · Saved {new Date(inspection.created_at).toLocaleString()}
          {inspection.updated_at && inspection.updated_at !== inspection.created_at && (
            <span> · Updated {new Date(inspection.updated_at).toLocaleString()}</span>
          )}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-700 block mb-1">Vehicle</label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                required
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} — {v.make} {v.model}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Inspector name"
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              required
            />
          </div>

          <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
            <div className="bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-600 uppercase sticky top-0 z-[1] grid grid-cols-[1fr_auto_auto_auto_minmax(100px,1fr)] gap-2 items-center">
              <span>Item</span>
              <span className="text-center text-emerald-600">Pass</span>
              <span className="text-center text-amber-600">Warn</span>
              <span className="text-center text-red-600">Fail</span>
              <span>Note</span>
            </div>
            {items.map((row, idx) => (
              <div
                key={idx}
                className="px-3 py-2 grid grid-cols-[1fr_auto_auto_auto_minmax(100px,1fr)] gap-2 items-center border-t border-zinc-100 text-sm"
              >
                <div>
                  <div className="text-[10px] font-bold uppercase text-zinc-400">{row.category}</div>
                  <div className="text-zinc-900">{row.item}</div>
                </div>
                {(["pass", "caution", "fail"] as InspectionRating[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRating(idx, r)}
                    className={`min-h-9 min-w-9 rounded-lg text-base touch-manipulation ${
                      row.rating === r
                        ? r === "pass"
                          ? "bg-emerald-500 text-white"
                          : r === "caution"
                            ? "bg-amber-500 text-white"
                            : "bg-red-500 text-white"
                        : "bg-zinc-100 text-zinc-400"
                    }`}
                  >
                    {r === "pass" ? "✓" : r === "caution" ? "!" : "✗"}
                  </button>
                ))}
                <input
                  type="text"
                  value={row.note}
                  onChange={(e) => setNote(idx, e.target.value)}
                  className="h-9 rounded border border-zinc-200 px-2 text-xs"
                  placeholder="Note"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting} className="min-h-[44px] touch-manipulation">
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} className="min-h-[44px]">
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
