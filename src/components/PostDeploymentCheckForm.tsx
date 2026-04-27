"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EntityPickerField,
  type EntityPickerOption,
} from "@/components/ui/entity-picker";
import { useAuth } from "@/lib/auth-context";
import type { InspectionRating } from "@/types";

interface VehicleOption {
  id: string;
  code: string;
  make: string;
  model: string;
}

interface Props {
  vehicles: VehicleOption[];
  organizationId: string;
  preselectedVehicleId?: string;
  tripId?: string;
  onComplete: () => void;
  onCancel: () => void;
}

interface CheckItem {
  category: string;
  item: string;
}

const MECHANICAL_ITEMS: CheckItem[] = [
  { category: "Engine", item: "Oil leaks" },
  { category: "Engine", item: "Coolant level" },
  { category: "Engine", item: "Unusual noises" },
  { category: "Engine", item: "Warning lights" },
  { category: "Drivetrain", item: "Clutch operation" },
  { category: "Drivetrain", item: "Gearbox shifting" },
  { category: "Drivetrain", item: "4WD engagement" },
  { category: "Brakes", item: "Brake performance" },
  { category: "Brakes", item: "Handbrake" },
  { category: "Brakes", item: "Brake fluid" },
  { category: "Suspension", item: "Shock absorbers" },
  { category: "Suspension", item: "Ball joints / bushes" },
  { category: "Suspension", item: "Steering play" },
  { category: "Fluids", item: "Engine oil level" },
  { category: "Fluids", item: "Transmission fluid" },
  { category: "Fluids", item: "Power steering fluid" },
  { category: "Tires", item: "Tire pressure" },
  { category: "Tires", item: "Tread depth" },
  { category: "Tires", item: "Spare wheel" },
  { category: "Body", item: "New damage or dents" },
  { category: "Body", item: "Lights functional" },
  { category: "Body", item: "Windshield" },
];

export function PostDeploymentCheckForm({
  vehicles,
  organizationId,
  preselectedVehicleId,
  tripId,
  onComplete,
  onCancel,
}: Props) {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<Record<number, InspectionRating>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState(preselectedVehicleId ?? "");

  function setRating(idx: number, rating: InspectionRating) {
    setRatings((prev) => ({ ...prev, [idx]: rating }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    const fd = new FormData(e.currentTarget);
    const vehicleId = fd.get("vehicleId") as string;
    if (!vehicleId) {
      setFormError("Please select a vehicle.");
      return;
    }

    const checkItems = MECHANICAL_ITEMS.map((item, idx) => ({
      category: item.category,
      item: item.item,
      rating: ratings[idx] || "pass",
      note: notes[idx] || "",
    }));

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/post-deployment-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          vehicleId,
          tripId: tripId || null,
          mechanicId: user?.id || "",
          mechanicName: fd.get("mechanicName") || user?.name || "",
          checkItems,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormError(err.error || "Failed to submit check");
        setIsSubmitting(false);
        return;
      }
      onComplete();
    } catch {
      setFormError("Network error — please try again.");
      setIsSubmitting(false);
    }
  }

  let lastCategory = "";

  return (
    <Card className="border-orange-200 shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">Post-Deployment Mechanical Check</CardTitle>
        <p className="text-sm text-zinc-500 font-normal">
          Mechanic inspection after vehicle return. 2+ failures auto-create a work order.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <EntityPickerField
              name="vehicleId"
              label="Vehicle"
              required
              value={selectedVehicleId}
              onChange={setSelectedVehicleId}
              modalTitle="Pick a vehicle"
              searchPlaceholder="Search by code, make, model…"
              placeholder="Select vehicle…"
              showCount
              options={vehicles.map<EntityPickerOption>((v) => ({
                value: v.id,
                label: `${v.code} — ${v.make} ${v.model}`,
                searchTokens: [v.code, v.make, v.model],
              }))}
            />
            <Input name="mechanicName" label="Mechanic *" required placeholder="Your name" defaultValue={user?.name || ""} />
            <Input label="Date" value={new Date().toLocaleDateString()} readOnly className="bg-zinc-50" />
          </div>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {formError}
            </div>
          )}

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-600 uppercase grid grid-cols-[1fr_auto_auto_auto_140px] gap-2 items-center">
              <span>Item</span>
              <span className="w-10 text-center text-emerald-600">Pass</span>
              <span className="w-10 text-center text-amber-600">Warn</span>
              <span className="w-10 text-center text-red-600">Fail</span>
              <span>Note</span>
            </div>
            {MECHANICAL_ITEMS.map((item, idx) => {
              const showHeader = item.category !== lastCategory;
              lastCategory = item.category;
              const rating = ratings[idx] || "pass";

              return (
                <div key={idx}>
                  {showHeader && (
                    <div className="bg-zinc-50 px-4 py-1.5 text-xs font-bold text-zinc-500 uppercase border-t border-zinc-200">
                      {item.category}
                    </div>
                  )}
                  <div className="px-4 py-2 grid grid-cols-[1fr_auto_auto_auto_140px] gap-2 items-center border-t border-zinc-100 text-sm">
                    <span>{item.item}</span>
                    {(["pass", "caution", "fail"] as InspectionRating[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRating(idx, r)}
                        className={`min-h-10 min-w-10 h-10 w-10 rounded-lg flex items-center justify-center text-lg transition-colors touch-manipulation ${
                          rating === r
                            ? r === "pass" ? "bg-emerald-500 text-white" : r === "caution" ? "bg-amber-500 text-white" : "bg-red-500 text-white"
                            : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                        }`}
                      >
                        {r === "pass" ? "✓" : r === "caution" ? "!" : "✗"}
                      </button>
                    ))}
                    <input
                      type="text"
                      placeholder="Note…"
                      value={notes[idx] || ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [idx]: e.target.value }))}
                      className="h-10 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting} size="lg" className="min-h-[48px] touch-manipulation">
              {isSubmitting ? "Submitting…" : "Submit mechanical check"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} size="lg" className="min-h-[48px]">
              Cancel
            </Button>
            <span className="text-xs text-zinc-500 self-center">{MECHANICAL_ITEMS.length} check items</span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
