"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { InspectionRating } from "@/types";
import { useAuth } from "@/lib/auth-context";

interface InspectionRow {
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
}

interface VehicleOption {
  id: string;
  code: string;
  make: string;
  model: string;
}


const PRE_DEPARTURE_ITEMS = [
  { category: "Exterior", item: "Tires condition & pressure" },
  { category: "Exterior", item: "Lights (headlights, brake, indicators)" },
  { category: "Exterior", item: "Mirrors (side, rear)" },
  { category: "Exterior", item: "Body damage (new dents, cracks)" },
  { category: "Exterior", item: "Windshield condition" },
  { category: "Exterior", item: "License plates visible" },
  { category: "Fluids", item: "Engine oil level" },
  { category: "Fluids", item: "Coolant level" },
  { category: "Fluids", item: "Brake fluid level" },
  { category: "Interior", item: "Seatbelts functional" },
  { category: "Interior", item: "Horn working" },
  { category: "Interior", item: "Spare wheel present" },
  { category: "Interior", item: "Jack & tools present" },
  { category: "Interior", item: "Fire extinguisher present" },
  { category: "Interior", item: "First aid kit present" },
  { category: "Engine", item: "Starts normally" },
  { category: "Engine", item: "No warning lights" },
  { category: "Engine", item: "No unusual noises" },
];

const DETAILED_ITEMS = [
  ...PRE_DEPARTURE_ITEMS,
  { category: "Engine & Exhaust", item: "Battery & contacts" },
  { category: "Engine & Exhaust", item: "Exhaust system" },
  { category: "Engine & Exhaust", item: "Air filter" },
  { category: "Engine & Exhaust", item: "Fan belt condition" },
  { category: "Engine & Exhaust", item: "Glow plugs (diesel)" },
  { category: "Drivetrain", item: "Clutch operation" },
  { category: "Drivetrain", item: "Gearbox (all gears engage)" },
  { category: "Drivetrain", item: "4x4 engagement" },
  { category: "Drivetrain", item: "Propshaft / CV joints" },
  { category: "Brakes", item: "Brake pad thickness" },
  { category: "Brakes", item: "Disc/drum condition" },
  { category: "Brakes", item: "Handbrake operation" },
  { category: "Suspension", item: "Shock absorbers" },
  { category: "Suspension", item: "Ball joints" },
  { category: "Suspension", item: "Control arms & bushes" },
  { category: "Suspension", item: "Stabilizer links" },
  { category: "Steering", item: "Power steering fluid" },
  { category: "Steering", item: "Steering play" },
  { category: "Electrical", item: "All lights" },
  { category: "Electrical", item: "Wiper operation" },
  { category: "Electrical", item: "Battery voltage" },
  { category: "Electrical", item: "Alternator charging" },
];

export default function InspectionsPage(): React.ReactElement {
  const { organizationId } = useAuth();
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const loadInspections = useCallback(() => {
    fetch(`/api/inspections?org=${organizationId}`)
      .then((r) => r.json())
      .then((d) => { setInspections(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [organizationId]);

  useEffect(() => {
    loadInspections();
    fetch(`/api/vehicles?org=${organizationId}`).then((r) => r.json()).then(setVehicles).catch(() => {});
  }, [loadInspections, organizationId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{inspections.length} inspections</p>
        <Button onClick={() => setShowForm(!showForm)} size="lg">
          + New Inspection
        </Button>
      </div>

      {showForm && (
        <InspectionForm
          vehicles={vehicles}
          onComplete={() => { setShowForm(false); loadInspections(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <div className="text-zinc-500 text-center py-12">Loading...</div>
      ) : inspections.length === 0 ? (
        <div className="text-zinc-500 text-center py-12">No inspections yet. Start one above.</div>
      ) : (
        <div className="space-y-3">
          {inspections.map((insp) => (
            <InspectionCard key={insp.id} inspection={insp} />
          ))}
        </div>
      )}
    </div>
  );
}

function InspectionCard({ inspection }: { inspection: InspectionRow }): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const failCount = inspection.items.filter((i) => i.rating === "fail").length;
  const cautionCount = inspection.items.filter((i) => i.rating === "caution").length;

  return (
    <Card className={!inspection.overall_pass ? "border-red-200" : ""}>
      <div className="p-4 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-base font-bold">{inspection.vehicle_code}</Badge>
            <div>
              <div className="font-medium capitalize">{inspection.type.replace("-", " ")} Inspection</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                By {inspection.inspector_name || "Unknown"} · {new Date(inspection.created_at).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {failCount > 0 && <Badge variant="destructive">{failCount} fail</Badge>}
            {cautionCount > 0 && <Badge variant="warning">{cautionCount} caution</Badge>}
            {failCount === 0 && cautionCount === 0 && <Badge variant="success">All pass</Badge>}
          </div>
        </div>
      </div>

      {isExpanded && (
        <CardContent className="border-t border-zinc-100 pt-4">
          <div className="space-y-1">
            {groupByCategory(inspection.items).map(([category, items]) => (
              <div key={category} className="mb-3">
                <div className="text-xs font-bold text-zinc-500 uppercase mb-1">{category}</div>
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 px-2 rounded text-sm hover:bg-zinc-50">
                    <span>{item.item}</span>
                    <div className="flex items-center gap-2">
                      {item.note && <span className="text-xs text-zinc-400">{item.note}</span>}
                      <RatingDot rating={item.rating} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function RatingDot({ rating }: { rating: InspectionRating }): React.ReactElement {
  const colors = { pass: "bg-emerald-500", caution: "bg-amber-500", fail: "bg-red-500" };
  return (
    <span className={`inline-block h-3 w-3 rounded-full ${colors[rating]}`} title={rating} />
  );
}

function groupByCategory(items: Array<{ category: string; item: string; rating: InspectionRating; note: string }>): Array<[string, typeof items]> {
  const map = new Map<string, typeof items>();
  for (const item of items) {
    const existing = map.get(item.category) || [];
    existing.push(item);
    map.set(item.category, existing);
  }
  return Array.from(map.entries());
}

function InspectionForm({ vehicles, onComplete, onCancel }: {
  vehicles: VehicleOption[];
  onComplete: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const [inspType, setInspType] = useState<"pre-departure" | "detailed">("pre-departure");
  const templateItems = inspType === "pre-departure" ? PRE_DEPARTURE_ITEMS : DETAILED_ITEMS;
  const [ratings, setRatings] = useState<Record<number, InspectionRating>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setRating(idx: number, rating: InspectionRating): void {
    setRatings((prev) => ({ ...prev, [idx]: rating }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);

    const items = templateItems.map((tmpl, idx) => ({
      category: tmpl.category,
      item: tmpl.item,
      rating: ratings[idx] || "pass",
      note: notes[idx] || "",
    }));

    const body = {
      vehicleId: fd.get("vehicleId"),
      inspectorName: fd.get("inspectorName"),
      type: inspType,
      items,
    };

    const res = await fetch("/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onComplete();
    else setIsSubmitting(false);
  }

  let currentCategory = "";

  return (
    <Card className="border-emerald-200">
      <CardHeader>
        <CardTitle>New Inspection</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Select name="vehicleId" label="Vehicle *" required>
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.code} — {v.make} {v.model}</option>
              ))}
            </Select>
            <Input name="inspectorName" label="Inspector Name *" required placeholder="Your name" />
            <Select
              label="Inspection Type"
              value={inspType}
              onChange={(e) => {
                setInspType(e.target.value as "pre-departure" | "detailed");
                setRatings({});
                setNotes({});
              }}
            >
              <option value="pre-departure">Pre-Departure (Quick)</option>
              <option value="detailed">Detailed Mechanical</option>
            </Select>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-600 uppercase grid grid-cols-[1fr_auto_auto_auto_140px] gap-2 items-center">
              <span>Item</span>
              <span className="w-10 text-center text-emerald-600">Pass</span>
              <span className="w-10 text-center text-amber-600">Warn</span>
              <span className="w-10 text-center text-red-600">Fail</span>
              <span>Note</span>
            </div>
            {templateItems.map((tmpl, idx) => {
              const isNewCategory = tmpl.category !== currentCategory;
              currentCategory = tmpl.category;
              const rating = ratings[idx] || "pass";

              return (
                <div key={idx}>
                  {isNewCategory && (
                    <div className="bg-zinc-50 px-4 py-1.5 text-xs font-bold text-zinc-500 uppercase border-t border-zinc-200">
                      {tmpl.category}
                    </div>
                  )}
                  <div className="px-4 py-2 grid grid-cols-[1fr_auto_auto_auto_140px] gap-2 items-center border-t border-zinc-100 text-sm">
                    <span>{tmpl.item}</span>
                    {(["pass", "caution", "fail"] as InspectionRating[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRating(idx, r)}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors ${
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
                      placeholder="Note..."
                      value={notes[idx] || ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [idx]: e.target.value }))}
                      className="h-10 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting} size="lg">
              {isSubmitting ? "Submitting..." : "Submit Inspection"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
