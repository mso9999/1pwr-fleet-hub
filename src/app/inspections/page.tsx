"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  EntityPickerField,
  type EntityPickerOption,
} from "@/components/ui/entity-picker";
import type { InspectionRating } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { DriverProficiencyChecklistForm } from "@/components/DriverProficiencyChecklistForm";
import { InspectionEditForm, type InspectionEditRow } from "@/components/InspectionEditForm";
import { VehicleBodyDiagram } from "@/components/VehicleBodyDiagram";
import { isBodyPlanRow, type BodyMark } from "@/lib/inspection-body-diagram";
import { failEvidenceMessage } from "@/lib/inspection-validation";
import { uploadInspectionFailPhotos } from "@/lib/upload-inspection-fail-photos";
import { useTutorial } from "@/components/tutorial/tutorial-context";

type InspectionRow = InspectionEditRow;

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
  { category: "Exterior", item: "Body / panels (Mark damage with X)" },
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
  const { active, trackId, stepIndex } = useTutorial();
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InspectionRow | null>(null);

  useEffect(() => {
    if (!active || trackId !== "vehicleInspection") return;
    if (stepIndex >= 2) setShowForm(true);
  }, [active, trackId, stepIndex]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">{inspections.length} saved checklists (max 500 listed)</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            Create, view, edit, or delete. Export CSV under Reports.{" "}
            <Link href="/guide/inspections" className="text-blue-600 hover:underline font-medium">
              How to fill out a checklist
            </Link>
          </p>
        </div>
        <span data-tutorial="tutorial-inspections-new">
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(!showForm);
            }}
            size="lg"
            className="touch-manipulation min-h-[48px]"
          >
            + New inspection
          </Button>
        </span>
      </div>

      {editing && (
        <InspectionEditForm
          inspection={editing}
          vehicles={vehicles}
          organizationId={organizationId}
          onSaved={() => { setEditing(null); loadInspections(); }}
          onCancel={() => setEditing(null)}
        />
      )}

      {showForm && !editing && (
        <InspectionForm
          vehicles={vehicles}
          organizationId={organizationId}
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
            <InspectionCard
              key={insp.id}
              inspection={insp}
              organizationId={organizationId}
              onEdit={(row) => {
                setShowForm(false);
                setEditing(row);
              }}
              onDeleted={() => loadInspections()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InspectionCard({
  inspection,
  organizationId,
  onEdit,
  onDeleted,
}: {
  inspection: InspectionRow;
  organizationId: string;
  onEdit: (row: InspectionRow) => void;
  onDeleted: () => void;
}): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const failCount = inspection.items.filter((i) => i.rating === "fail").length;
  const cautionCount = inspection.items.filter((i) => i.rating === "caution").length;

  async function handleDelete(): Promise<void> {
    if (!window.confirm("Delete this inspection permanently? This cannot be undone.")) return;
    setIsDeleting(true);
    const res = await fetch(`/api/inspections/${inspection.id}?org=${encodeURIComponent(organizationId)}`, {
      method: "DELETE",
    });
    setIsDeleting(false);
    if (res.ok) onDeleted();
  }

  return (
    <Card className={!inspection.overall_pass ? "border-red-200" : ""}>
      <div className="p-4">
        <div
          className="flex items-center justify-between gap-2 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsExpanded(!isExpanded);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Badge variant="secondary" className="text-base font-bold shrink-0">{inspection.vehicle_code}</Badge>
            <div className="min-w-0">
              <div className="font-medium capitalize">
                {inspection.type === "driver-proficiency-2025"
                  ? "1PWR checklist (2025)"
                  : inspection.type === "mechanical-transfer"
                    ? "Mechanical (cross-border transfer)"
                    : `${inspection.type.replace(/-/g, " ")} inspection`}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                By {inspection.inspector_name || "Unknown"} · {new Date(inspection.created_at).toLocaleString()}
                {inspection.updated_at && inspection.updated_at !== inspection.created_at && (
                  <span> · Updated {new Date(inspection.updated_at).toLocaleString()}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {failCount > 0 && <Badge variant="destructive">{failCount} fail</Badge>}
            {cautionCount > 0 && <Badge variant="warning">{cautionCount} caution</Badge>}
            {failCount === 0 && cautionCount === 0 && <Badge variant="success">All pass</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
          <Button type="button" size="sm" variant="outline" className="touch-manipulation" onClick={() => onEdit(inspection)}>
            Edit
          </Button>
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

      {isExpanded && (
        <CardContent className="border-t border-zinc-100 pt-4">
          <div className="space-y-1">
            {groupByCategory(inspection.items).map(([category, items]) => (
              <div key={category} className="mb-3">
                <div className="text-xs font-bold text-zinc-500 uppercase mb-1">{category}</div>
                {items.map((item, idx) => (
                  <div key={idx} className="space-y-2 py-1">
                    <div className="flex items-center justify-between px-2 rounded text-sm hover:bg-zinc-50">
                      <span>{item.item}</span>
                      <div className="flex items-center gap-2">
                        {item.note && <span className="text-xs text-zinc-400">{item.note}</span>}
                        <RatingDot rating={item.rating} />
                      </div>
                    </div>
                    {item.bodyMarks && item.bodyMarks.length > 0 && (
                      <div className="px-2 pb-2">
                        <VehicleBodyDiagram marks={item.bodyMarks} onChange={() => {}} readOnly className="max-w-md" />
                      </div>
                    )}
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

type ItemWithMarks = {
  category: string;
  item: string;
  rating: InspectionRating;
  note: string;
  bodyMarks?: BodyMark[];
};

function groupByCategory(items: ItemWithMarks[]): Array<[string, ItemWithMarks[]]> {
  const map = new Map<string, ItemWithMarks[]>();
  for (const item of items) {
    const existing = map.get(item.category) || [];
    existing.push(item);
    map.set(item.category, existing);
  }
  return Array.from(map.entries());
}

function InspectionForm({ vehicles, organizationId, onComplete, onCancel }: {
  vehicles: VehicleOption[];
  organizationId: string;
  onComplete: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const { user } = useAuth();
  const [inspType, setInspType] = useState<
    "pre-departure" | "detailed" | "mechanical-transfer" | "driver-proficiency-2025"
  >("pre-departure");
  const templateItems =
    inspType === "pre-departure"
      ? PRE_DEPARTURE_ITEMS
      : inspType === "detailed" || inspType === "mechanical-transfer"
        ? DETAILED_ITEMS
        : [];
  const [ratings, setRatings] = useState<Record<number, InspectionRating>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [bodyMarksByIdx, setBodyMarksByIdx] = useState<Record<number, BodyMark[]>>({});
  const [pendingFailPhotos, setPendingFailPhotos] = useState<Record<number, File[]>>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URL(window.location.href).searchParams.get("vehicleId") ?? "";
  });

  function resetDraft(): void {
    setRatings({});
    setNotes({});
    setBodyMarksByIdx({});
    setPendingFailPhotos({});
    setFormError("");
  }

  if (inspType === "driver-proficiency-2025") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" data-tutorial="tutorial-inspections-tabs">
          {(
            [
              ["pre-departure", "Pre-departure (quick)"],
              ["detailed", "Detailed mechanical"],
              ["mechanical-transfer", "Mechanical (cross-border transfer)"],
              ["driver-proficiency-2025", "1PWR checklist (2025) — full"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setInspType(value);
                resetDraft();
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium touch-manipulation min-h-[44px] ${
                inspType === value ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <DriverProficiencyChecklistForm
          vehicles={vehicles}
          organizationId={organizationId}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      </div>
    );
  }

  function setRating(idx: number, rating: InspectionRating): void {
    setRatings((prev) => ({ ...prev, [idx]: rating }));
    if (rating !== "fail") {
      setPendingFailPhotos((p) => {
        const next = { ...p };
        delete next[idx];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setFormError("");
    const fd = new FormData(e.currentTarget);

    const items: ItemWithMarks[] = templateItems.map((tmpl, idx) => {
      const bm = bodyMarksByIdx[idx];
      const base = {
        category: tmpl.category,
        item: tmpl.item,
        rating: ratings[idx] || "pass",
        note: notes[idx] || "",
      };
      return bm?.length ? { ...base, bodyMarks: bm } : base;
    });

    const err = failEvidenceMessage(items, pendingFailPhotos);
    if (err) {
      setFormError(err);
      return;
    }

    setIsSubmitting(true);
    const body = {
      organizationId,
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
    if (!res.ok) {
      setIsSubmitting(false);
      return;
    }
    const data = (await res.json()) as { id: string };
    await uploadInspectionFailPhotos(
      data.id,
      items,
      pendingFailPhotos,
      user?.id ?? "",
      user?.name || user?.email || ""
    );
    setIsSubmitting(false);
    onComplete();
  }

  return (
    <Card className="border-emerald-200" data-tutorial="tutorial-inspections-form">
      <CardHeader>
        <CardTitle>New inspection</CardTitle>
        <p className="text-sm text-zinc-500 font-normal">
          Any <strong>Fail</strong> needs a line note, a photo, or a note on a body-plan mark. Use the plan view on the Body line to place Xs.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="flex flex-wrap gap-2" data-tutorial="tutorial-inspections-tabs">
            {(
              [
                ["pre-departure", "Pre-departure (quick)"],
                ["detailed", "Detailed mechanical"],
                ["mechanical-transfer", "Mechanical (cross-border transfer)"],
                ["driver-proficiency-2025", "1PWR checklist (2025) — full"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setInspType(value);
                  resetDraft();
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium touch-manipulation min-h-[44px] ${
                  inspType === value ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

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
            <Input name="inspectorName" label="Inspector name *" required placeholder="Your name" />
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
            {templateItems.map((tmpl, idx) => {
              const prev = templateItems[idx - 1];
              const showCategoryHeader = !prev || prev.category !== tmpl.category;
              const rating = ratings[idx] || "pass";

              return (
                <div key={idx}>
                  {showCategoryHeader && (
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
                      placeholder="Note..."
                      value={notes[idx] || ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [idx]: e.target.value }))}
                      className="h-10 w-full rounded-lg border border-zinc-200 px-2 text-xs"
                    />
                  </div>
                  {rating === "fail" && (
                    <div className="px-4 py-2 border-t border-red-100 bg-red-50/60 space-y-1">
                      <label className="text-xs font-medium text-red-900 block">Fail — add photo(s) (optional if note or mark note above)</label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        capture="environment"
                        className="block w-full text-xs text-zinc-700"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setPendingFailPhotos((p) => ({ ...p, [idx]: files }));
                        }}
                      />
                      {(pendingFailPhotos[idx]?.length ?? 0) > 0 && (
                        <p className="text-xs text-red-800">{pendingFailPhotos[idx]!.length} file(s) will upload after save</p>
                      )}
                    </div>
                  )}
                  {isBodyPlanRow(tmpl.category, tmpl.item) && (
                    <div className="px-2 sm:px-4 py-3 border-t border-zinc-200 bg-slate-50/90">
                      <VehicleBodyDiagram
                        marks={bodyMarksByIdx[idx] || []}
                        onChange={(marks) => setBodyMarksByIdx((prev) => ({ ...prev, [idx]: marks }))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3">
            <span data-tutorial="tutorial-inspections-submit" className="inline-flex">
              <Button type="submit" disabled={isSubmitting} size="lg" className="min-h-[48px] touch-manipulation">
                {isSubmitting ? "Submitting..." : "Submit inspection"}
              </Button>
            </span>
            <Button type="button" variant="outline" onClick={onCancel} size="lg" className="min-h-[48px]">
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
