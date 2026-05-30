"use client";

import { useEffect, useState, useMemo, useRef, type ChangeEvent, type ReactElement } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { MISSION_PROFILE, type MissionProfile } from "@/lib/trip-readiness";
import { useOverrideCapability } from "@/lib/useOverrideCapability";
import {
  normalizeRouteStops,
  normalizeTripShape,
  routeStopsEqual,
} from "@/lib/trip-route";
import { isMultiStopRolloutEnabled } from "@/lib/feature-flags";

interface RefItem {
  code: string;
  label: string;
}

interface MissionForTrip {
  id: string;
  destination: string;
  departure_date: string;
  return_date: string;
  mission_type: string;
  trip_shape?: string;
  mission_profile: string;
  assigned_vehicle_id: string;
  assigned_vehicle_code?: string | null;
  title: string;
  approval_status?: string;
  passengers: string;
  loadout_summary: string;
  stops?: Array<{
    stop_order: number;
    location: string;
    load_out?: string;
    load_in?: string;
    notes?: string;
  }>;
}

interface StopInput {
  location: string;
  loadOut: string;
  loadIn: string;
  notes: string;
}

interface ReadinessResponse {
  ok: boolean;
  missionProfile: string;
  gates: Array<{ id: string; label: string; status: string; detail: string }>;
  missionBlockedReason?: string;
}

interface TripDraftRow {
  id: string;
  mission_id?: string;
  payload_json?: string;
  updated_at?: string;
}

function buildMissionPatch(
  orig: MissionForTrip,
  ed: {
    destination: string;
    returnDate: string;
    departureDate: string;
    missionProfile: string;
    missionType: string;
    passengers: string;
    loadoutSummary: string;
  }
): Record<string, unknown> | null {
  const p: Record<string, unknown> = {};
  if (ed.destination.trim() !== (orig.destination || "").trim()) p.destination = ed.destination.trim();
  if (ed.returnDate.trim() !== (orig.return_date || "").trim()) p.returnDate = ed.returnDate.trim();
  if (ed.departureDate.trim() !== (orig.departure_date || "").trim()) p.departureDate = ed.departureDate.trim();
  const mp = ed.missionProfile === MISSION_PROFILE.FIELD ? MISSION_PROFILE.FIELD : MISSION_PROFILE.LOCAL;
  const omp = (orig.mission_profile || MISSION_PROFILE.LOCAL) === MISSION_PROFILE.FIELD ? MISSION_PROFILE.FIELD : MISSION_PROFILE.LOCAL;
  if (mp !== omp) p.missionProfile = mp;
  if (ed.missionType.trim() !== (orig.mission_type || "").trim()) p.missionType = ed.missionType.trim();
  if (ed.passengers.trim() !== (orig.passengers || "").trim()) p.passengers = ed.passengers.trim();
  if (ed.loadoutSummary.trim() !== (orig.loadout_summary || "").trim()) p.loadoutSummary = ed.loadoutSummary.trim();
  return Object.keys(p).length > 0 ? p : null;
}

export function TripCheckoutForm({
  organizationId,
  user,
  sites,
  missionTypes,
  onComplete,
  onCancel,
}: {
  organizationId: string;
  user: { id: string; role: string; name?: string; email?: string } | null;
  sites: RefItem[];
  missionTypes: RefItem[];
  onComplete: () => void;
  onCancel: () => void;
}): ReactElement {
  const multiStopEnabled = isMultiStopRolloutEnabled();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [tripDrafts, setTripDrafts] = useState<TripDraftRow[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [missions, setMissions] = useState<MissionForTrip[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(true);
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const [missionSnapshot, setMissionSnapshot] = useState<MissionForTrip | null>(null);
  const [adjustMission, setAdjustMission] = useState(false);
  const [missionEdits, setMissionEdits] = useState<{
    destination: string;
    returnDate: string;
    departureDate: string;
    missionProfile: MissionProfile;
    missionType: string;
    passengers: string;
    loadoutSummary: string;
  }>({
    destination: "",
    returnDate: "",
    departureDate: "",
    missionProfile: MISSION_PROFILE.LOCAL,
    missionType: "other",
    passengers: "",
    loadoutSummary: "",
  });
  const [canMissionManage, setCanMissionManage] = useState(false);

  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isMultiStop, setIsMultiStop] = useState(false);
  const [stops, setStops] = useState<StopInput[]>([{ location: "", loadOut: "", loadIn: "", notes: "" }]);
  const [plannedStops, setPlannedStops] = useState<StopInput[]>([]);
  const [routeChangeReason, setRouteChangeReason] = useState("");
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const { canOverride } = useOverrideCapability(organizationId);
  const formRef = useRef<HTMLFormElement | null>(null);

  const selectedMission = useMemo(
    () => missions.find((m) => m.id === selectedMissionId) ?? null,
    [missions, selectedMissionId]
  );

  const checkDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let cancelled = false;
    setMissionsLoading(true);
    void fetch(
      `/api/missions?org=${encodeURIComponent(organizationId)}&status=planned&approvalStatus=approved&tripCheckoutEligible=true`
    )
      .then((r) => r.json())
      .then((d: unknown) => {
        if (!cancelled) {
          setMissions(Array.isArray(d) ? (d as MissionForTrip[]) : []);
          setMissionsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMissions([]);
          setMissionsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const headers = await jsonHeadersWithBearer();
      const res = await fetch(
        `/api/trips?org=${encodeURIComponent(organizationId)}&drafts=true`,
        { headers }
      );
      if (!res.ok) return;
      const drafts = (await res.json()) as TripDraftRow[];
      if (!cancelled) setTripDrafts(Array.isArray(drafts) ? drafts : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const headers = await jsonHeadersWithBearer();
      const res = await fetch(
        `/api/me/mission-request-can-approve?org=${encodeURIComponent(organizationId)}`,
        { headers }
      );
      if (!res.ok) {
        if (!cancelled) setCanMissionManage(false);
        return;
      }
      const j = (await res.json()) as { canFullEdit?: boolean };
      if (!cancelled) setCanMissionManage(!!j.canFullEdit);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!selectedMission) {
      setMissionSnapshot(null);
      setPlannedStops([]);
      setStops([{ location: "", loadOut: "", loadIn: "", notes: "" }]);
      setIsMultiStop(false);
      return;
    }
    setMissionSnapshot({ ...selectedMission });
    setMissionEdits({
      destination: selectedMission.destination || "",
      returnDate: selectedMission.return_date || "",
      departureDate: selectedMission.departure_date || "",
      missionProfile:
        (selectedMission.mission_profile || MISSION_PROFILE.LOCAL) === MISSION_PROFILE.FIELD
          ? MISSION_PROFILE.FIELD
          : MISSION_PROFILE.LOCAL,
      missionType: selectedMission.mission_type || "other",
      passengers: selectedMission.passengers || "",
      loadoutSummary: selectedMission.loadout_summary || "",
    });
    const orderedStops = [...(selectedMission.stops || [])].sort(
      (a, b) => (a.stop_order || 0) - (b.stop_order || 0)
    );
    const normalizedStops = orderedStops.map((s) => ({
      location: String(s.location || ""),
      loadOut: String(s.load_out || ""),
      loadIn: String(s.load_in || ""),
      notes: String(s.notes || ""),
    }));
    setPlannedStops(normalizedStops);
    if (multiStopEnabled && normalizedStops.length > 0) {
      setStops(normalizedStops);
      setIsMultiStop(true);
    } else {
      const shape = normalizeTripShape(selectedMission.trip_shape);
      setIsMultiStop(shape === "multi_stop" || shape === "round_trip");
      setStops([{ location: "", loadOut: "", loadIn: "", notes: "" }]);
    }
    setRouteChangeReason("");
  }, [selectedMission]);

  const vehicleId = selectedMission?.assigned_vehicle_id ?? "";

  useEffect(() => {
    if (!vehicleId || !selectedMissionId) {
      setReadiness(null);
      return;
    }
    let cancelled = false;
    setReadinessLoading(true);
    const q = new URLSearchParams({
      org: organizationId,
      vehicleId,
      missionId: selectedMissionId,
      checkDate,
    });
    fetch(`/api/trips/readiness?${q}`)
      .then((r) => r.json())
      .then((data: ReadinessResponse) => {
        if (!cancelled) {
          setReadiness(data);
          setReadinessLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setReadinessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, selectedMissionId, organizationId, checkDate]);

  function addStop(): void {
    setStops([...stops, { location: "", loadOut: "", loadIn: "", notes: "" }]);
  }

  function updateStop(idx: number, field: keyof StopInput, value: string): void {
    const updated = [...stops];
    updated[idx] = { ...updated[idx], [field]: value };
    setStops(updated);
  }

  function removeStop(idx: number): void {
    setStops(stops.filter((_, i) => i !== idx));
  }

  const canFleetHold = user?.role === "fleet_lead" || user?.role === "superadmin";
  const vehicleOperationalBlocked =
    readiness?.gates?.some((g) => g.id === "vehicle_operational" && g.status !== "satisfied") ?? false;

  async function placeCheckoutHold(): Promise<void> {
    if (!selectedMissionId) return;
    const reason = window.prompt(
      "Explain the checkout hold for management (min 8 characters). E.g. reserved vehicle not operational and no spare unit."
    );
    if (!reason || reason.trim().length < 8) {
      if (reason) window.alert("Reason must be at least 8 characters.");
      return;
    }
    const res = await fetch(`/api/missions/${selectedMissionId}/checkout-hold`, {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ reason: reason.trim() }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(j.error || "Could not place checkout hold.");
      return;
    }
    window.alert("Mission placed on checkout hold. Management sees a dashboard alert.");
    onComplete();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setCheckoutError(null);
    if (!selectedMission || !missionSnapshot) {
      setCheckoutError("Select a mission that is approved, reserved, and ready for checkout.");
      return;
    }

    setIsSubmitting(true);

    if (adjustMission && canMissionManage) {
      const patch = buildMissionPatch(missionSnapshot, missionEdits);
      if (patch) {
        const pr = await fetch(`/api/missions/${selectedMission.id}`, {
          method: "PATCH",
          headers: await jsonHeadersWithBearer(),
          body: JSON.stringify(patch),
        });
        const updated = (await pr.json().catch(() => ({}))) as {
          error?: string;
          approval_status?: string;
        };
        if (!pr.ok) {
          setCheckoutError(updated.error || "Could not update mission.");
          setIsSubmitting(false);
          return;
        }
        if (String(updated.approval_status || "").toLowerCase() === "pending") {
          setCheckoutError(
            "Mission parameters changed in a way that requires management re-approval. Wait for approval, then return to check out."
          );
          setIsSubmitting(false);
          return;
        }
      }
    }

    const fd = new FormData(e.currentTarget);
    const dest =
      adjustMission && canMissionManage ? missionEdits.destination.trim() : selectedMission.destination;
    const mType =
      adjustMission && canMissionManage ? missionEdits.missionType.trim() : selectedMission.mission_type;
    const passengersTrip =
      adjustMission && canMissionManage ? missionEdits.passengers.trim() : fd.get("passengers") || selectedMission.passengers;

    const body: Record<string, unknown> = {
      organizationId,
      missionId: selectedMission.id,
      vehicleId: selectedMission.assigned_vehicle_id,
      driverName: fd.get("driverName"),
      odoStart: Number(fd.get("odoStart")),
      departureLocation: fd.get("departureLocation"),
      destination: dest,
      missionType: mType,
      tripShape: normalizeTripShape(selectedMission.trip_shape),
      missionProfile:
        adjustMission && canMissionManage
          ? missionEdits.missionProfile
          : selectedMission.mission_profile || MISSION_PROFILE.LOCAL,
      passengers: passengersTrip,
      loadOut: fd.get("loadOut"),
    };

    const normalizedStops = multiStopEnabled ? normalizeRouteStops(stops) : [];
    const normalizedPlannedStops = multiStopEnabled ? normalizeRouteStops(plannedStops) : [];
    const stopPlanChanged =
      multiStopEnabled &&
      normalizedPlannedStops.length > 0 &&
      !routeStopsEqual(normalizedPlannedStops, normalizedStops);
    if (multiStopEnabled && isMultiStop && normalizedStops.length > 0) {
      body.stops = normalizedStops;
    }
    if (stopPlanChanged) {
      if (routeChangeReason.trim().length < 8) {
        setCheckoutError("Route differs from mission plan. Add a route change reason (min 8 chars).");
        setIsSubmitting(false);
        return;
      }
      body.routeChangeReason = routeChangeReason.trim();
    }

    if (canOverride && overrideEnabled && overrideReason.trim().length > 0) {
      body.overrideReason = overrideReason.trim();
    }

    const res = await fetch("/api/trips", {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onComplete();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      gates?: ReadinessResponse["gates"];
      missionProfile?: string;
    };
    setCheckoutError(data.error || "Check-out failed. Fix the items below and try again.");
    if (data.gates && Array.isArray(data.gates)) {
      setReadiness({
        ok: false,
        missionProfile: data.missionProfile || body.missionProfile as string,
        gates: data.gates,
      });
    }
    setIsSubmitting(false);
  }

  async function saveTripDraft(): Promise<void> {
    if (!formRef.current) return;
    setDraftNotice(null);
    setCheckoutError(null);
    setIsSavingDraft(true);
    const fd = new FormData(formRef.current);
    const body: Record<string, unknown> = {
      action: "saveDraft",
      draftId: activeDraftId ?? undefined,
      organizationId,
      missionId: selectedMissionId || "",
      driverName: fd.get("driverName") || "",
      odoStart: fd.get("odoStart") || "",
      departureLocation: fd.get("departureLocation") || "",
      destination: selectedMission?.destination || "",
      missionType: fd.get("missionType") || selectedMission?.mission_type || "other",
      tripShape: normalizeTripShape(selectedMission?.trip_shape),
      missionProfile: selectedMission?.mission_profile || MISSION_PROFILE.LOCAL,
      passengers: fd.get("passengers") || "",
      loadOut: fd.get("loadOut") || "",
      stops: isMultiStop ? normalizeRouteStops(stops) : [],
      routeChangeReason,
      overrideReason,
    };
    const res = await fetch("/api/trips", {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify(body),
    });
    setIsSavingDraft(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setCheckoutError(err.error || "Could not save draft trip.");
      return;
    }
    const row = (await res.json()) as TripDraftRow;
    const nextId = String(row.id || "");
    setActiveDraftId(nextId || null);
    setDraftNotice("Trip draft saved. Only you, admins, and IT can view/edit it.");
    const headers = await jsonHeadersWithBearer();
    const listRes = await fetch(
      `/api/trips?org=${encodeURIComponent(organizationId)}&drafts=true`,
      { headers }
    );
    if (listRes.ok) {
      const drafts = (await listRes.json()) as TripDraftRow[];
      setTripDrafts(Array.isArray(drafts) ? drafts : []);
    }
  }

  function loadTripDraft(row: TripDraftRow): void {
    const payload = JSON.parse(String(row.payload_json || "{}")) as Record<string, unknown>;
    setActiveDraftId(row.id);
    const missionId = String(payload.missionId || row.mission_id || "");
    setSelectedMissionId(missionId);
    setRouteChangeReason(String(payload.routeChangeReason || ""));
    setOverrideReason(String(payload.overrideReason || ""));
    const incomingStops = Array.isArray(payload.stops) ? normalizeRouteStops(payload.stops) : [];
    if (incomingStops.length > 0) {
      setIsMultiStop(true);
      setStops(incomingStops);
    }
    const form = formRef.current;
    if (!form) return;
    const setValue = (name: string, value: string): void => {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (el) el.value = value;
    };
    setValue("driverName", String(payload.driverName || ""));
    setValue("odoStart", String(payload.odoStart || ""));
    setValue("departureLocation", String(payload.departureLocation || ""));
    setValue("missionType", String(payload.missionType || "other"));
    setValue("passengers", String(payload.passengers || ""));
    setValue("loadOut", String(payload.loadOut || ""));
    setDraftNotice("Trip draft loaded. Continue editing and click Create trip when ready.");
  }

  const readinessFailing = vehicleId !== "" && readiness !== null && !readiness.ok;
  const overrideValid = canOverride && overrideEnabled && overrideReason.trim().length >= 8;
  const submitBlocked =
    !selectedMissionId ||
    !vehicleId ||
    readinessLoading ||
    (readinessFailing && !overrideValid);

  return (
    <Card className="border-blue-200 bg-blue-50/30" data-tutorial="tutorial-trip-checkout-card">
      <CardHeader>
        <CardTitle>Start trip (mission checkout)</CardTitle>
        <p className="text-sm text-zinc-500 font-normal">
          Select an approved mission with a fleet-reserved vehicle. The vehicle cannot be changed here — ask fleet to reassign on{" "}
          <Link href="/vehicle-requests" className="text-blue-600 underline font-medium">
            Missions
          </Link>
          . Optional mission edits require fleet/management permission and may re-open approval.
        </p>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {tripDrafts.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 space-y-1">
              <div className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Saved trip drafts</div>
              <div className="flex flex-wrap gap-2">
                {tripDrafts.map((d) => (
                  <Button
                    key={d.id}
                    type="button"
                    size="sm"
                    variant={activeDraftId === d.id ? "default" : "outline"}
                    onClick={() => loadTripDraft(d)}
                  >
                    {activeDraftId === d.id ? "Editing draft" : "Load draft"}{" "}
                    {d.updated_at ? `(${new Date(d.updated_at).toLocaleDateString()})` : ""}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-zinc-700">Mission *</label>
              <select
                value={selectedMissionId}
                onChange={(e) => setSelectedMissionId(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                required
              >
                <option value="">{missionsLoading ? "Loading missions…" : "Select mission…"}</option>
                {missions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {(m.title || m.destination).slice(0, 72)} · {m.departure_date} · {m.assigned_vehicle_code || "vehicle"}
                  </option>
                ))}
              </select>
              {!missionsLoading && missions.length === 0 && (
                <div className="mt-1 space-y-1">
                  <p className="text-xs text-amber-800">
                    No eligible missions. You need an approved mission, active status, a reserved vehicle, and no open trip on that mission.
                  </p>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href="/vehicle-requests?newMission=1&returnTo=%2Ftrips">
                      + Create mission now
                    </Link>
                  </Button>
                </div>
              )}
            </div>

            {selectedMission && (
              <div className="sm:col-span-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm space-y-1">
                <div>
                  <span className="text-zinc-500">Reserved vehicle: </span>
                  <strong>{selectedMission.assigned_vehicle_code || selectedMission.assigned_vehicle_id}</strong>
                </div>
                <div>
                  <span className="text-zinc-500">Profile: </span>
                  {(selectedMission.mission_profile || MISSION_PROFILE.LOCAL) === MISSION_PROFILE.FIELD ? "Field" : "Local"} —{" "}
                  {MISSION_PROFILE.FIELD === (selectedMission.mission_profile || MISSION_PROFILE.LOCAL)
                    ? "departing driver checklist required today"
                    : "departing driver checklist not required"}
                </div>
              </div>
            )}

            {selectedMission && canMissionManage && selectedMission.approval_status === "draft" && (
              <div className="sm:col-span-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 space-y-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adjustMission}
                    onChange={(e) => setAdjustMission(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium text-amber-900">Adjust mission parameters</span>
                    <span className="block text-xs text-amber-800">
                      Material changes (dates, destination, profile, class, etc.) send the mission back to management for re-approval before checkout can complete.
                    </span>
                  </span>
                </label>
                {adjustMission && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Destination"
                      value={missionEdits.destination}
                      onChange={(e) => setMissionEdits((s) => ({ ...s, destination: e.target.value }))}
                    />
                    <Input
                      label="Departure date"
                      type="date"
                      value={missionEdits.departureDate}
                      onChange={(e) => setMissionEdits((s) => ({ ...s, departureDate: e.target.value }))}
                    />
                    <Input
                      label="Return date"
                      type="date"
                      value={missionEdits.returnDate}
                      onChange={(e) => setMissionEdits((s) => ({ ...s, returnDate: e.target.value }))}
                    />
                    <div>
                      <label className="text-sm font-medium text-zinc-700">Mission profile</label>
                      <select
                        value={missionEdits.missionProfile}
                        onChange={(e) =>
                          setMissionEdits((s) => ({
                            ...s,
                            missionProfile:
                              e.target.value === MISSION_PROFILE.FIELD
                                ? MISSION_PROFILE.FIELD
                                : MISSION_PROFILE.LOCAL,
                          }))
                        }
                        className="mt-1.5 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value={MISSION_PROFILE.LOCAL}>Local / HQ vicinity</option>
                        <option value={MISSION_PROFILE.FIELD}>Field deployment</option>
                      </select>
                    </div>
                    <Select
                      label="Mission type"
                      value={missionEdits.missionType}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                        setMissionEdits((s) => ({ ...s, missionType: e.target.value }))
                      }
                    >
                      {missionTypes.map((m) => (
                        <option key={m.code} value={m.code}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="Passengers (mission)"
                      value={missionEdits.passengers}
                      onChange={(e) => setMissionEdits((s) => ({ ...s, passengers: e.target.value }))}
                    />
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-zinc-700">Loadout summary (mission)</label>
                      <textarea
                        value={missionEdits.loadoutSummary}
                        onChange={(e) => setMissionEdits((s) => ({ ...s, loadoutSummary: e.target.value }))}
                        rows={2}
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <Input name="driverName" label="Driver name *" required placeholder="Your name" />
            <Input name="odoStart" label="ODO reading (km) *" type="number" required placeholder="e.g. 271964" />
            <Select name="departureLocation" label="Departing from *" required>
              {sites.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
            {!adjustMission || !canMissionManage ? (
              <div>
                <label className="text-sm font-medium text-zinc-700">Destination (from mission)</label>
                <p className="mt-1.5 text-sm text-zinc-800 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                  {selectedMission?.destination || "—"}
                </p>
              </div>
            ) : (
              <Input label="Destination (edited)" value={missionEdits.destination} readOnly className="bg-zinc-50" />
            )}
            <Select
              key={selectedMissionId || "none"}
              name="missionType"
              label="Mission type (trip record) *"
              required
              defaultValue={selectedMission?.mission_type || "other"}
            >
              {missionTypes.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </Select>
            <Input name="passengers" label="Passengers (trip)" placeholder="Names" />
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-zinc-700">Load out (items leaving)</label>
              <textarea
                name="loadOut"
                rows={2}
                className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                placeholder="e.g. tools, samples"
              />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 space-y-2" data-tutorial="tutorial-trip-readiness-gates">
            {!vehicleId && (
              <p className="text-sm text-zinc-500">
                Select an approved mission with a reserved vehicle to see trip readiness gates (driver checklist, operational status, etc.).
              </p>
            )}
            {vehicleId && (
              <>
              <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">Trip readiness</div>
              {readinessLoading && <p className="text-sm text-zinc-500">Checking requirements…</p>}
              {!readinessLoading && readiness && (
                <ul className="space-y-2">
                  {readiness.gates.map((g) => (
                    <li key={g.id} className="flex gap-2 text-sm">
                      <span
                        className={
                          g.status === "satisfied" ? "text-emerald-600 shrink-0" : "text-amber-600 shrink-0"
                        }
                      >
                        {g.status === "satisfied" ? "✓" : "!"}
                      </span>
                      <div>
                        <div className="font-medium text-zinc-800">{g.label}</div>
                        <div className="text-zinc-600 text-xs">{g.detail}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!readinessLoading && readiness && !readiness.ok && (
                <p className="text-xs text-zinc-500 pt-1">
                  Open{" "}
                  <Link
                    href={`/vehicle-checks?vehicleId=${encodeURIComponent(vehicleId)}&returnTo=${encodeURIComponent("/trips")}`}
                    className="text-blue-600 underline font-medium"
                  >
                    Vehicle checks
                  </Link>{" "}
                  as needed.
                </p>
              )}
              {vehicleOperationalBlocked && canFleetHold && (
                <div className="pt-2 border-t border-zinc-100">
                  <Button type="button" variant="outline" size="sm" onClick={() => void placeCheckoutHold()}>
                    Place mission on checkout hold (alert management)
                  </Button>
                  <p className="text-xs text-zinc-600 mt-1">
                    Use when the reserved unit is not operational and no alternate is available; management can accept, reassign another mission&apos;s vehicle, or cancel.
                  </p>
                </div>
              )}
              {!readinessLoading && readiness && !readiness.ok && canOverride && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideEnabled}
                      onChange={(e) => setOverrideEnabled(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium text-amber-900">Manager / approver override</span>
                      <span className="block text-xs text-amber-800">
                        Logged in the audit trail. Use only when policy allows.
                      </span>
                    </span>
                  </label>
                  {overrideEnabled && (
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      rows={2}
                      placeholder="Reason (min 8 characters)"
                      className="w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm"
                    />
                  )}
                </div>
              )}
              </>
            )}
          </div>

          {checkoutError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{checkoutError}</div>
          )}
          {draftNotice && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{draftNotice}</div>
          )}

          {multiStopEnabled && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMultiStop(!isMultiStop)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isMultiStop ? "bg-blue-600" : "bg-zinc-200"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isMultiStop ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
            <span className="text-sm text-zinc-600">Multi-stop itinerary</span>
          </div>
          )}

          {multiStopEnabled && isMultiStop && (
            <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/20 p-4">
              <p className="text-xs font-medium text-zinc-500 uppercase">Intermediate stops</p>
              {stops.map((stop, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-4 items-end">
                  <Select
                    label={`Stop ${idx + 1}`}
                    value={stop.location}
                    onChange={(e) => updateStop(idx, "location", e.target.value)}
                  >
                    <option value="">Select site…</option>
                    {sites.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Load out"
                    value={stop.loadOut}
                    onChange={(e) => updateStop(idx, "loadOut", e.target.value)}
                  />
                  <Input
                    label="Load in"
                    value={stop.loadIn}
                    onChange={(e) => updateStop(idx, "loadIn", e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Input
                      label="Notes"
                      value={stop.notes}
                      onChange={(e) => updateStop(idx, "notes", e.target.value)}
                    />
                    {stops.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStop(idx)}
                        className="text-red-400 hover:text-red-600 text-lg mt-6"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addStop}>
                + Add stop
              </Button>
              {plannedStops.length > 0 && !routeStopsEqual(normalizeRouteStops(stops), normalizeRouteStops(plannedStops)) && (
                <div className="space-y-1 pt-2 border-t border-blue-100">
                  <label className="text-xs font-medium text-zinc-700 uppercase tracking-wide">
                    Route change reason *
                  </label>
                  <textarea
                    value={routeChangeReason}
                    onChange={(e) => setRouteChangeReason(e.target.value)}
                    rows={2}
                    placeholder="Explain why checkout route differs from approved mission plan."
                    className="w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 flex-wrap items-center">
            <Button type="submit" disabled={isSubmitting || submitBlocked} size="lg">
              {isSubmitting ? "Creating…" : "Create trip"}
            </Button>
            <Button type="button" variant="outline" disabled={isSavingDraft} onClick={() => void saveTripDraft()}>
              {isSavingDraft ? "Saving draft…" : "Save draft"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            {submitBlocked && selectedMissionId && !readinessLoading && (
              <span className="text-xs text-amber-700">
                Select a mission, satisfy readiness, or use a manager override.
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
