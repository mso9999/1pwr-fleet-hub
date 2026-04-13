"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { MEDIA_CATEGORY } from "@/types";
import { uploadDriverVehicleCheckPhotos } from "@/lib/upload-driver-vehicle-check-photos";

const DVC_PHOTO_SLOTS = [
  { id: "exterior_front", label: "Front", category: MEDIA_CATEGORY.DVC_EXTERIOR_FRONT },
  { id: "exterior_rear", label: "Rear", category: MEDIA_CATEGORY.DVC_EXTERIOR_REAR },
  { id: "exterior_left", label: "Left side", category: MEDIA_CATEGORY.DVC_EXTERIOR_LEFT },
  { id: "exterior_right", label: "Right side", category: MEDIA_CATEGORY.DVC_EXTERIOR_RIGHT },
  { id: "odometer", label: "Odometer (photo of gauge)", category: MEDIA_CATEGORY.DVC_ODOMETER },
] as const;

const EXTERIOR_PHOTO_SLOTS = DVC_PHOTO_SLOTS.filter((s) => s.id !== "odometer");
const ODOMETER_PHOTO_SLOT = DVC_PHOTO_SLOTS.find((s) => s.id === "odometer")!;

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

type PassFail = "pass" | "fail";
type YesNo = 1 | 0;

interface StatusItem {
  key: string;
  label: string;
  category: string;
}

const STATUS_ITEMS: StatusItem[] = [
  { key: "electricsFrontLights", label: "Front lights", category: "Electrics" },
  { key: "electricsRearLights", label: "Rear lights", category: "Electrics" },
  { key: "electricsIndicators", label: "Indicators", category: "Electrics" },
  { key: "electricsBrakeLights", label: "Brake lights", category: "Electrics" },
  { key: "electricsHorn", label: "Horn", category: "Electrics" },
  { key: "electricsWindows", label: "Windows", category: "Electrics" },
  { key: "electricsCentralLocking", label: "Central locking", category: "Electrics" },
  { key: "electricsWipers", label: "Wipers", category: "Electrics" },
  { key: "electricsDashboardGauges", label: "Dashboard / gauges", category: "Electrics" },
  { key: "electricsAcHeating", label: "AC / heating", category: "Electrics" },
  { key: "fluidsEngineOil", label: "Engine oil", category: "Fluid Levels" },
  { key: "fluidsEngineCoolant", label: "Engine coolant", category: "Fluid Levels" },
  { key: "fluidsPowerSteering", label: "Power steering", category: "Fluid Levels" },
  { key: "fluidsTransmission", label: "Transmission", category: "Fluid Levels" },
  { key: "fluidsFuel", label: "Fuel", category: "Fluid Levels" },
  { key: "driveSteering", label: "Steering", category: "Driveability" },
  { key: "driveBrakes", label: "Brakes", category: "Driveability" },
  { key: "driveTirePressure", label: "Tire pressure / condition", category: "Driveability" },
  { key: "visualSpareWheelCondition", label: "Spare wheel condition", category: "Visual Inspection" },
  { key: "visualDoors", label: "Doors", category: "Visual Inspection" },
];

interface EquipItem {
  key: string;
  label: string;
  group: string;
}

const EQUIP_ITEMS: EquipItem[] = [
  { key: "equipJack", label: "Jack", group: "Equipment" },
  { key: "equipSpareWheel", label: "Spare wheel", group: "Equipment" },
  { key: "equipTriangle", label: "Triangle (2x)", group: "Equipment" },
  { key: "equipJumpLeads", label: "Jump leads", group: "Equipment" },
  { key: "equipFireExtinguisher", label: "Fire extinguisher (operational?)", group: "Equipment" },
  { key: "equipPhoneCharger", label: "1PWR phone in vehicle (with charger)", group: "Equipment" },
  { key: "equipFirstAidKit", label: "First aid kit", group: "Equipment" },
  { key: "equipFlashlight", label: "Flashlight with batteries", group: "Equipment" },
  { key: "equipToolWheelSpanners", label: "Wheel spanners", group: "Basic Tools" },
  { key: "equipToolMultimeter", label: "Digital multimeter", group: "Basic Tools" },
  { key: "equipToolCableCutters", label: "Cable cutters", group: "Basic Tools" },
  { key: "equipToolPliers", label: "Pliers", group: "Basic Tools" },
  { key: "equipToolTowStraps", label: "Tow straps", group: "Basic Tools" },
  { key: "equipToolInverter", label: "Inverter", group: "Basic Tools" },
];

export function DriverVehicleCheckForm({ vehicles, organizationId, onComplete, onCancel }: Props) {
  const { user } = useAuth();
  const [direction, setDirection] = useState<"departing" | "returning">("departing");
  const [statusRatings, setStatusRatings] = useState<Record<string, PassFail>>({});
  const [failureDescs, setFailureDescs] = useState<Record<string, string>>({});
  const [equipChecks, setEquipChecks] = useState<Record<string, YesNo>>({});
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [photoFiles, setPhotoFiles] = useState<Partial<Record<string, File>>>({});
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const s of DVC_PHOTO_SLOTS) {
      const f = photoFiles[s.id];
      if (f) urls[s.id] = URL.createObjectURL(f);
    }
    setPhotoPreviewUrls(urls);
    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [photoFiles]);

  function setPhotoSlot(slotId: string, file: File | null): void {
    setPhotoFiles((prev) => {
      const next = { ...prev };
      if (file) next[slotId] = file;
      else delete next[slotId];
      return next;
    });
  }

  const failedItems = Object.entries(statusRatings).filter(([, v]) => v === "fail");
  const hasFails = failedItems.length > 0;

  function toggleStatus(key: string) {
    setStatusRatings((prev) => ({
      ...prev,
      [key]: prev[key] === "fail" ? "pass" : "fail",
    }));
  }

  function toggleEquip(key: string) {
    setEquipChecks((prev) => ({
      ...prev,
      [key]: prev[key] === 0 ? 1 : 0,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    const fd = new FormData(e.currentTarget);

    if (!fd.get("vehicleId")) {
      setFormError("Please select a vehicle.");
      return;
    }

    const mileageRaw = (fd.get("mileageKm") as string)?.trim() ?? "";
    const mileageKm = mileageRaw ? parseInt(mileageRaw, 10) : NaN;
    if (!Number.isFinite(mileageKm) || mileageKm < 0) {
      setFormError("Enter a valid odometer reading (km).");
      return;
    }

    for (const s of DVC_PHOTO_SLOTS) {
      if (!photoFiles[s.id]) {
        setFormError(`Add a photo: ${s.label}.`);
        return;
      }
    }

    setIsSubmitting(true);

    const payload: Record<string, unknown> = {
      organizationId,
      vehicleId: fd.get("vehicleId"),
      driverId: user?.id || "",
      driverName: fd.get("driverName") || user?.name || "",
      mileageKm,
      routeFrom: fd.get("routeFrom") || "",
      routeTo: fd.get("routeTo") || "",
      direction,
      remarks,
      travelPhoneNumber: (fd.get("travelPhoneNumber") as string) || "",
      failureDescriptions: failureDescs,
    };

    for (const item of STATUS_ITEMS) {
      payload[item.key] = statusRatings[item.key] || "pass";
    }
    for (const item of EQUIP_ITEMS) {
      payload[item.key] = equipChecks[item.key] ?? 1;
    }

    let createdId: string | null = null;
    try {
      const res = await fetch("/api/driver-vehicle-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormError(err.error || "Failed to submit check");
        setIsSubmitting(false);
        return;
      }
      const created = (await res.json()) as { id: string };
      createdId = created.id;

      const uploadItems = DVC_PHOTO_SLOTS.map((s) => ({
        file: photoFiles[s.id]!,
        category: s.category,
        caption: s.label,
      }));
      await uploadDriverVehicleCheckPhotos(
        created.id,
        uploadItems,
        user?.id ?? "",
        user?.name || user?.email || ""
      );
      onComplete();
    } catch (err) {
      if (createdId) {
        try {
          await fetch(
            `/api/driver-vehicle-checks/${createdId}?org=${encodeURIComponent(organizationId)}`,
            { method: "DELETE" }
          );
        } catch {
          /* best-effort rollback */
        }
      }
      const msg = err instanceof Error ? err.message : "Upload failed";
      setFormError(
        createdId
          ? `Could not upload verification photos (${msg}). The draft check was discarded — try again.`
          : "Network error — please try again."
      );
      setIsSubmitting(false);
    }
  }

  let lastCategory = "";
  let lastGroup = "";

  return (
    <Card className="border-blue-200 shadow-md" data-tutorial="tutorial-dvc-form">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">Driver Vehicle Check</CardTitle>
        <p className="text-sm text-zinc-500 font-normal">
          Complete before each vehicle deployment. Failed items need a description.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          {/* Direction toggle */}
          <div className="flex gap-2" data-tutorial="tutorial-dvc-direction">
            {(["departing", "returning"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`rounded-lg px-5 py-2.5 text-sm font-medium capitalize touch-manipulation min-h-[44px] ${
                  direction === d
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                {d === "departing" ? "Vehicle Leaving HQ" : "Vehicle Returning to HQ"}
              </button>
            ))}
          </div>

          {/* Header fields */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select name="vehicleId" label="Vehicle *" required>
              <option value="">Select vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.code} — {v.make} {v.model}</option>
              ))}
            </Select>
            <Input name="driverName" label="Driver *" required placeholder="Your name" defaultValue={user?.name || ""} />
            <Input label="Date" value={new Date().toLocaleDateString()} readOnly className="bg-zinc-50" />
          </div>

          <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4" data-tutorial="tutorial-dvc-photos">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Input
                  name="mileageKm"
                  label="Odometer reading (km) *"
                  type="number"
                  min={0}
                  step={1}
                  required
                  placeholder="Type current ODO"
                />
                <p className="text-xs text-zinc-500">
                  Enter the reading from the gauge, then take a photo of the odometer for verification.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
                <div className="text-sm font-medium text-zinc-800">{ODOMETER_PHOTO_SLOT.label} *</div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="block w-full text-xs text-zinc-600"
                  onChange={(e) => setPhotoSlot("odometer", e.target.files?.[0] ?? null)}
                />
                {photoPreviewUrls.odometer && (
                  <img
                    src={photoPreviewUrls.odometer}
                    alt="Odometer preview"
                    className="w-full max-h-40 object-contain rounded-md border border-zinc-100 bg-zinc-50"
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">Exterior photos *</div>
            <p className="text-xs text-zinc-500">Front, rear, and both sides of the vehicle (one photo each).</p>
            <div className="grid grid-cols-2 gap-3">
              {EXTERIOR_PHOTO_SLOTS.map((s) => (
                <div key={s.id} className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
                  <div className="text-sm font-medium text-zinc-800">{s.label}</div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="block w-full text-xs text-zinc-600"
                    onChange={(e) => setPhotoSlot(s.id, e.target.files?.[0] ?? null)}
                  />
                  {photoPreviewUrls[s.id] && (
                    <img
                      src={photoPreviewUrls[s.id]}
                      alt=""
                      className="w-full h-28 object-cover rounded-md border border-zinc-100"
                    />
                  )}
                </div>
              ))}
            </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input name="routeFrom" label="Route from" placeholder="Departure location" />
            <Input name="routeTo" label="Route to" placeholder="Destination" />
          </div>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {formError}
            </div>
          )}

          {/* Status check items — Pass/Fail */}
          <div className="border rounded-lg overflow-hidden" data-tutorial="tutorial-dvc-status-grid">
            {STATUS_ITEMS.map((item) => {
              const showHeader = item.category !== lastCategory;
              lastCategory = item.category;
              const rating = statusRatings[item.key] || "pass";
              const isFail = rating === "fail";

              return (
                <div key={item.key}>
                  {showHeader && (
                    <div className="bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-600 uppercase border-t border-zinc-200 first:border-t-0">
                      {item.category}
                    </div>
                  )}
                  <div className="px-4 py-2 flex items-center justify-between gap-3 border-t border-zinc-100">
                    <span className="text-sm flex-1">{item.label}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStatus(item.key)}
                        className={`min-h-[44px] min-w-[44px] rounded-lg text-base font-semibold transition-colors touch-manipulation ${
                          !isFail
                            ? "bg-emerald-500 text-white shadow-sm"
                            : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                        }`}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatus(item.key)}
                        className={`min-h-[44px] min-w-[44px] rounded-lg text-base font-semibold transition-colors touch-manipulation ${
                          isFail
                            ? "bg-red-500 text-white shadow-sm"
                            : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                        }`}
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                  {isFail && (
                    <div className="px-4 py-2 bg-red-50/60 border-t border-red-100">
                      <input
                        type="text"
                        placeholder="Describe the failure…"
                        value={failureDescs[item.key] || ""}
                        onChange={(e) =>
                          setFailureDescs((prev) => ({ ...prev, [item.key]: e.target.value }))
                        }
                        className="h-10 w-full rounded-lg border border-red-200 px-3 text-sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Remarks <span className="text-zinc-400 font-normal">(e.g. leaking fluids, condition of windows…)</span>
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm resize-y"
              placeholder="Any observations…"
            />
          </div>

          {/* Equipment — Yes/No */}
          <div className="border rounded-lg overflow-hidden" data-tutorial="tutorial-dvc-equipment">
            {EQUIP_ITEMS.map((item) => {
              const showHeader = item.group !== lastGroup;
              lastGroup = item.group;
              const val = equipChecks[item.key] ?? 1;

              return (
                <div key={item.key}>
                  {showHeader && (
                    <div className="bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-600 uppercase border-t border-zinc-200 first:border-t-0">
                      {item.group}
                    </div>
                  )}
                  <div className="px-4 py-2 flex items-center justify-between gap-3 border-t border-zinc-100">
                    <span className="text-sm flex-1">{item.label}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => toggleEquip(item.key)}
                        className={`min-h-[44px] px-4 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                          val === 1
                            ? "bg-emerald-500 text-white shadow-sm"
                            : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleEquip(item.key)}
                        className={`min-h-[44px] px-4 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                          val === 0
                            ? "bg-amber-500 text-white shadow-sm"
                            : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>
                  {item.key === "equipPhoneCharger" && (
                    <div className="px-4 py-3 border-t border-blue-100 bg-blue-50/50 space-y-1.5">
                      <Input
                        name="travelPhoneNumber"
                        label="1PWR phone number"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="Number on the SIM or handset label (e.g. +266 …)"
                        className="max-w-md"
                      />
                      <p className="text-xs text-zinc-500">
                        Record the contact number for the 1PWR phone traveling with this vehicle.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Exception notice */}
          {hasFails && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
              <div className="text-sm font-semibold text-amber-900">
                {failedItems.length} item(s) failed — manager approval needed for deployment
              </div>
              <p className="text-xs text-amber-800">
                Submit this check and request exception approval from your supervisor. They can approve
                in-app or you can record a WhatsApp/verbal approval after submission.
              </p>
            </div>
          )}

          {/* Submit */}
          <div
            className="sticky bottom-0 z-10 flex flex-wrap gap-3 border-t border-zinc-200 bg-zinc-50/95 backdrop-blur py-4 -mx-4 px-4 md:static md:border-0 md:bg-transparent md:p-0"
            data-tutorial="tutorial-dvc-submit"
          >
            <Button
              type="submit"
              disabled={isSubmitting}
              size="lg"
              className="min-h-[48px] px-8 text-base touch-manipulation"
            >
              {isSubmitting ? "Submitting…" : "Submit vehicle check"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} size="lg" className="min-h-[48px]">
              Cancel
            </Button>
            <span className="text-xs text-zinc-500 self-center">
              {STATUS_ITEMS.length} check items · {EQUIP_ITEMS.length} equipment · 5 verification photos
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
