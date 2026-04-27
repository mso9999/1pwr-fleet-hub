"use client";

import { useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  EntityPickerField,
  type EntityPickerOption,
} from "@/components/ui/entity-picker";
import type { InspectionRating } from "@/types";
import {
  DRIVER_PROFICIENCY_PAIRED_ROWS,
  DRIVER_PROFICIENCY_FLAT_TEMPLATE,
  getFlatIndicesPerRow,
  type ChecklistCell,
} from "@/data/driver-proficiency-checklist-2025";
import { useAuth } from "@/lib/auth-context";
import { VehicleBodyDiagram } from "@/components/VehicleBodyDiagram";
import { isBodyPlanRow, type BodyMark } from "@/lib/inspection-body-diagram";
import { failEvidenceMessage } from "@/lib/inspection-validation";
import { uploadInspectionFailPhotos } from "@/lib/upload-inspection-fail-photos";

interface VehicleOption {
  id: string;
  code: string;
  make: string;
  model: string;
}

interface Props {
  vehicles: VehicleOption[];
  organizationId: string;
  onComplete: () => void;
  onCancel: () => void;
}

function CellRatingRow({
  cell,
  flatIdx,
  rating,
  note,
  onRating,
  onNote,
  showBodyDiagram,
  bodyMarks,
  onBodyMarks,
  onSelectFailPhotos,
  failPhotoCount,
}: {
  cell: ChecklistCell;
  flatIdx: number;
  rating: InspectionRating;
  note: string;
  onRating: (idx: number, r: InspectionRating) => void;
  onNote: (idx: number, v: string) => void;
  showBodyDiagram: boolean;
  bodyMarks: BodyMark[];
  onBodyMarks: (marks: BodyMark[]) => void;
  onSelectFailPhotos: (files: File[]) => void;
  failPhotoCount: number;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm space-y-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{cell.section}</div>
      <div className="mt-1 text-base font-medium text-zinc-900 leading-snug">{cell.item}</div>
      {cell.hint && <div className="mt-0.5 text-xs text-zinc-500">{cell.hint}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(["pass", "caution", "fail"] as InspectionRating[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onRating(flatIdx, r)}
            className={`min-h-[48px] min-w-[48px] rounded-xl text-lg font-semibold transition-colors touch-manipulation ${
              rating === r
                ? r === "pass"
                  ? "bg-emerald-500 text-white shadow"
                  : r === "caution"
                    ? "bg-amber-500 text-white shadow"
                    : "bg-red-500 text-white shadow"
                : "bg-zinc-100 text-zinc-500 active:bg-zinc-200"
            }`}
            aria-label={r}
          >
            {r === "pass" ? "✓" : r === "caution" ? "!" : "✗"}
          </button>
        ))}
        <span className="text-[10px] text-zinc-400 ml-1 hidden sm:inline">Pass / Warn / Fail</span>
      </div>
      <input
        type="text"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => onNote(flatIdx, e.target.value)}
        className="h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm"
      />
      {rating === "fail" && (
        <div className="rounded-lg border border-red-100 bg-red-50/70 p-2 space-y-1">
          <label className="text-xs font-medium text-red-900">Fail — photo(s) if no line / mark note</label>
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="block w-full text-xs"
            onChange={(e) => onSelectFailPhotos(Array.from(e.target.files || []))}
          />
          {failPhotoCount > 0 && <p className="text-xs text-red-800">{failPhotoCount} file(s) queued</p>}
        </div>
      )}
      {showBodyDiagram && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-2 -mx-1">
          <VehicleBodyDiagram marks={bodyMarks} onChange={onBodyMarks} />
        </div>
      )}
    </div>
  );
}

export function DriverProficiencyChecklistForm({
  vehicles,
  organizationId,
  onComplete,
  onCancel,
}: Props): React.ReactElement {
  const { user } = useAuth();
  const flatIndices = useMemo(() => getFlatIndicesPerRow(), []);
  const lineCount = DRIVER_PROFICIENCY_FLAT_TEMPLATE.length;
  const todayDisplay = useRef(new Date().toLocaleDateString()).current;

  const [ratings, setRatings] = useState<Record<number, InspectionRating>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [bodyMarksByFlatIdx, setBodyMarksByFlatIdx] = useState<Record<number, BodyMark[]>>({});
  const [pendingFailPhotos, setPendingFailPhotos] = useState<Record<number, File[]>>({});
  const [vehicleYear, setVehicleYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  function setRating(idx: number, r: InspectionRating): void {
    setRatings((prev) => ({ ...prev, [idx]: r }));
    if (r !== "fail") {
      setPendingFailPhotos((p) => {
        const n = { ...p };
        delete n[idx];
        return n;
      });
    }
  }

  function setNote(idx: number, v: string): void {
    setNotes((prev) => ({ ...prev, [idx]: v }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setFormError("");

    const headerItems: Array<{ category: string; item: string; rating: InspectionRating; note: string }> = [];
    if (vehicleYear.trim()) {
      headerItems.push({
        category: "Vehicle record",
        item: `Year: ${vehicleYear.trim()}`,
        rating: "pass",
        note: "",
      });
    }
    if (mileage.trim()) {
      headerItems.push({
        category: "Vehicle record",
        item: `Mileage (km): ${mileage.trim()}`,
        rating: "pass",
        note: "",
      });
    }
    if (approvedBy.trim()) {
      headerItems.push({
        category: "Vehicle record",
        item: `Management approval (defective vehicle): ${approvedBy.trim()}`,
        rating: "pass",
        note: "",
      });
    }

    const bodyItems = DRIVER_PROFICIENCY_FLAT_TEMPLATE.map((tmpl, idx) => {
      const bm = bodyMarksByFlatIdx[idx];
      const base = {
        category: tmpl.category,
        item: tmpl.item,
        rating: ratings[idx] || "pass",
        note: notes[idx] || "",
      };
      return bm?.length ? { ...base, bodyMarks: bm } : base;
    });

    const evidenceErr = failEvidenceMessage(bodyItems, pendingFailPhotos);
    if (evidenceErr) {
      setFormError(evidenceErr);
      return;
    }

    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);

    const body = {
      organizationId,
      vehicleId: fd.get("vehicleId"),
      inspectorName: fd.get("inspectorName"),
      type: "driver-proficiency-2025",
      items: [...headerItems, ...bodyItems],
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
    const headerLen = headerItems.length;
    const shiftedPending: Record<number, File[]> = {};
    for (const [k, files] of Object.entries(pendingFailPhotos)) {
      shiftedPending[headerLen + Number(k)] = files;
    }
    await uploadInspectionFailPhotos(
      data.id,
      body.items as Array<{ category: string; item: string }>,
      shiftedPending,
      user?.id ?? "",
      user?.name || user?.email || ""
    );
    setIsSubmitting(false);
    onComplete();
  }

  return (
    <Card className="border-blue-200 shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl sm:text-2xl">1PWR vehicle inspection checklist (2025)</CardTitle>
        <p className="text-sm text-zinc-500 font-normal">
          Each <strong>Fail</strong> needs a note, a body-plan mark note, or a photo. Use the plan view on the Body “(Mark damage with X)” line.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <Input name="inspectorName" label="Inspected by *" required placeholder="Name" />
            <Input label="Date" value={todayDisplay} readOnly className="bg-zinc-50" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3 rounded-xl bg-zinc-50 p-4 border border-zinc-100">
            <Input label="Year (optional)" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} placeholder="e.g. 2018" />
            <Input label="Mileage / ODO (optional)" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="km" />
            <Input
              label="Approved by — if defective (optional)"
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
              placeholder="Management sign-off"
            />
          </div>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {formError}
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 pb-2">
              <span className="text-sm font-semibold text-zinc-700">Functional checks</span>
              <span className="text-xs text-zinc-500 hidden md:inline">Two columns on wider screens — matches the paper form</span>
            </div>

            {DRIVER_PROFICIENCY_PAIRED_ROWS.map((pair, rowIdx) => {
              const { leftIdx, rightIdx } = flatIndices[rowIdx];
              return (
                <div
                  key={rowIdx}
                  className={`grid gap-3 ${pair.left && pair.right ? "md:grid-cols-2" : "md:grid-cols-1 max-w-xl"}`}
                >
                  {pair.left && leftIdx !== null && (
                    <CellRatingRow
                      cell={pair.left}
                      flatIdx={leftIdx}
                      rating={ratings[leftIdx] || "pass"}
                      note={notes[leftIdx] || ""}
                      onRating={setRating}
                      onNote={setNote}
                      showBodyDiagram={isBodyPlanRow(pair.left.section, pair.left.item)}
                      bodyMarks={bodyMarksByFlatIdx[leftIdx] || []}
                      onBodyMarks={(marks) =>
                        setBodyMarksByFlatIdx((prev) => ({ ...prev, [leftIdx]: marks }))
                      }
                      onSelectFailPhotos={(files) =>
                        setPendingFailPhotos((p) => ({ ...p, [leftIdx]: files }))
                      }
                      failPhotoCount={pendingFailPhotos[leftIdx]?.length ?? 0}
                    />
                  )}
                  {pair.right && rightIdx !== null && (
                    <CellRatingRow
                      cell={pair.right}
                      flatIdx={rightIdx}
                      rating={ratings[rightIdx] || "pass"}
                      note={notes[rightIdx] || ""}
                      onRating={setRating}
                      onNote={setNote}
                      showBodyDiagram={isBodyPlanRow(pair.right.section, pair.right.item)}
                      bodyMarks={bodyMarksByFlatIdx[rightIdx] || []}
                      onBodyMarks={(marks) =>
                        setBodyMarksByFlatIdx((prev) => ({ ...prev, [rightIdx]: marks }))
                      }
                      onSelectFailPhotos={(files) =>
                        setPendingFailPhotos((p) => ({ ...p, [rightIdx]: files }))
                      }
                      failPhotoCount={pendingFailPhotos[rightIdx]?.length ?? 0}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="sticky bottom-0 z-10 flex flex-wrap gap-3 border-t border-zinc-200 bg-zinc-50/95 backdrop-blur py-4 -mx-4 px-4 md:static md:border-0 md:bg-transparent md:p-0">
            <Button type="submit" disabled={isSubmitting} size="lg" className="min-h-[48px] px-8 text-base touch-manipulation">
              {isSubmitting ? "Submitting…" : "Submit inspection"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} size="lg" className="min-h-[48px]">
              Cancel
            </Button>
            <span className="text-xs text-zinc-500 self-center">
              {lineCount} checklist lines
              {headerItemsCount(vehicleYear, mileage, approvedBy) > 0
                ? ` + ${headerItemsCount(vehicleYear, mileage, approvedBy)} record field(s)`
                : ""}
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function headerItemsCount(y: string, m: string, a: string): number {
  let c = 0;
  if (y.trim()) c++;
  if (m.trim()) c++;
  if (a.trim()) c++;
  return c;
}
