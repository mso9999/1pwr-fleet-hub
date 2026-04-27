"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  EntityPickerField,
  type EntityPickerOption,
} from "@/components/ui/entity-picker";
import { useAuth } from "@/lib/auth-context";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { MediaUpload } from "@/components/MediaUpload";
import { LoadoutManifestsSection } from "@/components/LoadoutManifestsSection";
import { TripOdometerLog } from "@/components/TripOdometerLog";
import { MISSION_PROFILE } from "@/lib/trip-readiness";
import { useOverrideCapability } from "@/lib/useOverrideCapability";

interface TripRow {
  id: string;
  vehicle_id: string | null;
  vehicle_code: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  driver_name: string;
  odo_start: number | null;
  odo_end: number | null;
  departure_location: string;
  destination: string;
  arrival_location: string;
  mission_type: string;
  mission_profile?: string;
  passengers: string;
  load_out: string;
  load_in: string;
  checkout_at: string;
  checkin_at: string | null;
  issues_observed: string;
  distance: number | null;
  source: string;
}

interface VehicleOption {
  id: string;
  code: string;
  make: string;
  model: string;
  status: string;
  current_location: string;
}

interface RefItem { code: string; label: string; }
interface StopInput { location: string; loadOut: string; loadIn: string; notes: string; }

function TripsPageContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const tripParam = searchParams.get("trip");
  const vehicleParam = searchParams.get("vehicle");
  const { organizationId, user } = useAuth();
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [sites, setSites] = useState<RefItem[]>([]);
  const [missionTypes, setMissionTypes] = useState<RefItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkinTrip, setCheckinTrip] = useState<TripRow | null>(null);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);
  const [editingTrip, setEditingTrip] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadTrips = useCallback(() => {
    fetch(`/api/trips?org=${organizationId}`)
      .then((r) => r.json())
      .then((d) => { setTrips(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [organizationId]);

  useEffect(() => {
    loadTrips();
    fetch(`/api/vehicles?org=${organizationId}`).then((r) => r.json()).then(setVehicles).catch(() => {});
    fetch(`/api/reference-data?org=${organizationId}&type=site`).then((r) => r.json()).then((d: Array<RefItem & { active: number }>) => setSites(d.filter((i) => i.active))).catch(() => {});
    fetch(`/api/reference-data?org=${organizationId}&type=mission_type`).then((r) => r.json()).then((d: Array<RefItem & { active: number }>) => setMissionTypes(d.filter((i) => i.active))).catch(() => {});
  }, [loadTrips, organizationId]);

  async function deleteTrip(tripId: string): Promise<void> {
    if (!confirm("Delete this trip record permanently?")) return;
    const res = await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
    if (res.ok) {
      setExpandedTrip(null);
      setEditingTrip(null);
      loadTrips();
    }
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>, tripId: string): Promise<void> {
    e.preventDefault();
    setIsSaving(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      driverName: fd.get("driverName"),
      odoStart: Number(fd.get("odoStart")) || 0,
      odoEnd: fd.get("odoEnd") ? Number(fd.get("odoEnd")) : null,
      departureLocation: fd.get("departureLocation"),
      destination: fd.get("destination"),
      arrivalLocation: fd.get("arrivalLocation"),
      missionType: fd.get("missionType"),
      missionProfile: fd.get("missionProfile"),
      passengers: fd.get("passengers"),
      loadOut: fd.get("loadOut"),
      loadIn: fd.get("loadIn"),
      issuesObserved: fd.get("issuesObserved"),
    };
    if (body.odoEnd && body.odoStart) {
      body.distance = (body.odoEnd as number) - (body.odoStart as number);
    }
    const res = await fetch(`/api/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setEditingTrip(null);
      loadTrips();
    }
    setIsSaving(false);
  }

  const activeTrips = trips.filter((t) => !t.checkin_at);
  const completedTrips = trips.filter((t) => t.checkin_at);
  const operationalVehicles = vehicles.filter((v) => v.status === "operational" || v.status === "deployed");

  useEffect(() => {
    if (isLoading || trips.length === 0) return;
    if (tripParam) {
      const t = trips.find((tr) => tr.id === tripParam);
      if (!t) return;
      if (!t.checkin_at) {
        requestAnimationFrame(() => {
          document.getElementById(`trip-active-${t.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      } else {
        setExpandedTrip(t.id);
        requestAnimationFrame(() => {
          document.getElementById(`trip-row-${t.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
      return;
    }
    if (vehicleParam) {
      const forVehicle = trips.filter((t) => t.vehicle_id === vehicleParam);
      const active = forVehicle.find((t) => !t.checkin_at);
      if (active) {
        requestAnimationFrame(() => {
          document.getElementById(`trip-active-${active.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return;
      }
      const latest = forVehicle[0];
      if (latest) {
        setExpandedTrip(latest.id);
        requestAnimationFrame(() => {
          document.getElementById(`trip-row-${latest.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    }
  }, [isLoading, trips, tripParam, vehicleParam]);

  return (
    <div className="space-y-6">
      <p
        className="text-xs sm:text-sm text-zinc-600 rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2.5 leading-relaxed"
        data-tutorial="tutorial-trips-loadout-manifests"
      >
        <span className="font-medium text-zinc-800">Trip readiness: </span>
        Choose <strong>Local / in-town</strong> for short runs, or <strong>Field deployment</strong> for trips that need a recent detailed mechanical inspection.
        Both require today&apos;s <Link href="/vehicle-checks" className="text-blue-600 underline font-medium">departing driver checklist</Link>{" "}
        before check-out. <span className="font-medium text-zinc-800">Daily ODO: </span>
        While a trip is active, log typed odometer readings and optional gauge photos below each trip — no WhatsApp group needed.
        <span className="font-medium text-zinc-800"> Load-out manifests (AM): </span>
        Packing lists are built in Asset Management (am.1pwrafrica.com). On each trip below, use{" "}
        <span className="whitespace-nowrap font-medium">Load-out manifests (AM)</span> to link or open a manifest; expand a completed trip to see it.
      </p>
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{activeTrips.length} active · {completedTrips.length} completed</p>
        <span data-tutorial="tutorial-trips-checkout">
          <Button onClick={() => setShowCheckout(!showCheckout)} size="lg">+ Create Trip</Button>
        </span>
      </div>

      {showCheckout && (
        <CheckoutForm
          vehicles={operationalVehicles}
          sites={sites}
          missionTypes={missionTypes}
          organizationId={organizationId}
          onComplete={() => { setShowCheckout(false); loadTrips(); }}
          onCancel={() => setShowCheckout(false)}
        />
      )}

      {checkinTrip && (
        <CheckinForm
          trip={checkinTrip}
          sites={sites}
          onComplete={() => { setCheckinTrip(null); loadTrips(); }}
          onCancel={() => setCheckinTrip(null)}
        />
      )}

      {activeTrips.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Active Trips</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeTrips.map((trip) => (
                <div
                  key={trip.id}
                  id={`trip-active-${trip.id}`}
                  className="rounded-lg border border-blue-100 bg-blue-50/50 scroll-mt-24"
                >
                  <div className="flex items-center justify-between p-4">
                    <div>
                      <div className="flex items-center gap-2 font-medium flex-wrap">
                        {trip.vehicle_code ? (
                          <Badge variant="info">{trip.vehicle_code}</Badge>
                        ) : (
                          <Badge variant="secondary">Pending allocation</Badge>
                        )}
                        {(trip.mission_profile || MISSION_PROFILE.LOCAL) === MISSION_PROFILE.FIELD ? (
                          <Badge variant="destructive" className="text-[10px]">Field deployment</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Local</Badge>
                        )}
                        {trip.vehicle_make ? `${trip.vehicle_make} ${trip.vehicle_model}` : null}
                      </div>
                      <div className="text-sm text-zinc-600 mt-1">
                        {trip.departure_location} → {trip.destination}
                        {trip.load_out && <span className="ml-2 text-xs text-amber-600">Load: {trip.load_out}</span>}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        Driver: {trip.driver_name || "—"}
                        {trip.odo_start != null ? ` · ODO: ${Number(trip.odo_start).toLocaleString()} km` : ""}
                        · Out: {new Date(trip.checkout_at).toLocaleString()}
                        {trip.source !== "manual" && <Badge variant="secondary" className="ml-2 text-[10px]">{trip.source}</Badge>}
                      </div>
                    </div>
                    {trip.vehicle_code ? (
                      <Button size="sm" onClick={() => setCheckinTrip(trip)}>Check In</Button>
                    ) : (
                      <span className="text-xs text-zinc-500">Awaiting fleet allocation</span>
                    )}
                  </div>
                  <div className="px-4 pb-4 space-y-3">
                    <LoadoutManifestsSection
                      tripId={trip.id}
                      tripLabel={`${trip.vehicle_code} · ${trip.departure_location} → ${trip.destination} · ${new Date(trip.checkout_at).toLocaleDateString()}`}
                    />
                    <TripOdometerLog
                      tripId={trip.id}
                      organizationId={organizationId}
                      odoStart={trip.odo_start ?? 0}
                      active
                      recordedById={user?.id ?? ""}
                      recordedByName={user?.name || user?.email || ""}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Trip History</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-zinc-500 text-center py-8">Loading...</p>
          ) : completedTrips.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">No completed trips yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    <th className="pb-3 pr-3">Vehicle</th>
                    <th className="pb-3 pr-3">Route</th>
                    <th className="pb-3 pr-3 hidden sm:table-cell">Driver</th>
                    <th className="pb-3 pr-3 hidden md:table-cell">Mission</th>
                    <th className="pb-3 pr-3 hidden lg:table-cell">Kind</th>
                    <th className="pb-3 pr-3">Distance</th>
                    <th className="pb-3 pr-3 hidden sm:table-cell">Date</th>
                    <th className="pb-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {completedTrips.map((t) => (
                    <TripHistoryRow
                      key={t.id}
                      trip={t}
                      organizationId={organizationId}
                      isExpanded={expandedTrip === t.id}
                      isEditing={editingTrip === t.id}
                      isSaving={isSaving}
                      sites={sites}
                      missionTypes={missionTypes}
                      onToggle={() => { setExpandedTrip(expandedTrip === t.id ? null : t.id); setEditingTrip(null); }}
                      onEdit={() => setEditingTrip(t.id)}
                      onCancelEdit={() => setEditingTrip(null)}
                      onSave={(e) => saveEdit(e, t.id)}
                      onDelete={() => deleteTrip(t.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TripsPage(): React.ReactElement {
  return (
    <Suspense fallback={<p className="text-zinc-500 text-center py-12">Loading trips…</p>}>
      <TripsPageContent />
    </Suspense>
  );
}

interface ReadinessResponse {
  ok: boolean;
  missionProfile: string;
  gates: Array<{ id: string; label: string; status: string; detail: string }>;
}

function CheckoutForm({ vehicles, sites, missionTypes, organizationId, onComplete, onCancel }: {
  vehicles: VehicleOption[];
  sites: RefItem[];
  missionTypes: RefItem[];
  organizationId: string;
  onComplete: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutVehicleId, setCheckoutVehicleId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URL(window.location.href).searchParams.get("vehicleId") ?? "";
  });
  const [missionProfile, setMissionProfile] = useState<string>(MISSION_PROFILE.LOCAL);

  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isMultiStop, setIsMultiStop] = useState(false);
  const [stops, setStops] = useState<StopInput[]>([{ location: "", loadOut: "", loadIn: "", notes: "" }]);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const { canOverride } = useOverrideCapability(organizationId);

  const availableVehicles = vehicles.filter(
    (v) => !v.status || v.status === "operational" || v.id === checkoutVehicleId,
  );

  useEffect(() => {
    if (!checkoutVehicleId) {
      setReadiness(null);
      return;
    }
    let cancelled = false;
    setReadinessLoading(true);
    const q = new URLSearchParams({
      org: organizationId,
      vehicleId: checkoutVehicleId,
      missionProfile,
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
  }, [checkoutVehicleId, missionProfile, organizationId]);

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setCheckoutError(null);
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      organizationId,
      vehicleId: fd.get("vehicleId"),
      driverName: fd.get("driverName"),
      odoStart: Number(fd.get("odoStart")),
      departureLocation: fd.get("departureLocation"),
      destination: fd.get("destination"),
      missionType: fd.get("missionType"),
      missionProfile,
      passengers: fd.get("passengers"),
      loadOut: fd.get("loadOut"),
    };

    if (isMultiStop && stops.some((s) => s.location)) {
      body.stops = stops.filter((s) => s.location);
    }

    if (canOverride && overrideEnabled && overrideReason.trim().length > 0) {
      body.overrideReason = overrideReason.trim();
    }

    const res = await fetch("/api/trips", {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify(body),
    });
    if (res.ok) onComplete();
    else {
      const data = (await res.json().catch(() => ({}))) as { error?: string; gates?: ReadinessResponse["gates"] };
      setCheckoutError(data.error || "Check-out failed. Fix the items below and try again.");
      if (data.gates && Array.isArray(data.gates)) {
        setReadiness({ ok: false, missionProfile, gates: data.gates });
      }
      setIsSubmitting(false);
    }
  }

  const readinessFailing = checkoutVehicleId !== "" && readiness !== null && !readiness.ok;
  const overrideValid =
    canOverride && overrideEnabled && overrideReason.trim().length >= 8;
  const submitBlocked =
    (checkoutVehicleId !== "" && readinessLoading) ||
    (readinessFailing && !overrideValid);

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader>
        <CardTitle>Create Trip</CardTitle>
        <p className="text-sm text-zinc-500 font-normal">
          Pick a vehicle from the available pool now, or leave it blank — fleet management
          and approvers can assign or reassign a vehicle later. Trip readiness gates only
          apply once a vehicle is on the trip.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <EntityPickerField
              name="vehicleId"
              label="Vehicle (optional)"
              value={checkoutVehicleId}
              onChange={setCheckoutVehicleId}
              modalTitle="Pick a vehicle from the available pool"
              modalDescription="Operational vehicles in your organization. Leave blank if you want fleet to assign one."
              searchPlaceholder="Search by code, make, model, location…"
              placeholder="Leave to fleet (no preference)…"
              showCount
              allowClear
              clearLabel="Leave to fleet — no preference"
              helperText="Optional. Fleet management and approvers can reassign or replace this later."
              options={availableVehicles.map<EntityPickerOption>((v) => ({
                value: v.id,
                label: `${v.code} — ${v.make} ${v.model}`,
                description: v.current_location ?? undefined,
                meta: v.status,
                metaTone: v.status === "operational" ? "success" : "warning",
                searchTokens: [v.code, v.make, v.model, v.current_location ?? "", v.status ?? ""],
              }))}
            />
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
              <label className="text-sm font-medium text-zinc-700">Trip kind *</label>
              <p className="text-xs text-zinc-500 -mt-0.5 mb-0">Local = errands around town. Field = deployments needing a recent detailed inspection.</p>
              <select
                value={missionProfile}
                onChange={(e) => setMissionProfile(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              >
                <option value={MISSION_PROFILE.LOCAL}>Local / in-town</option>
                <option value={MISSION_PROFILE.FIELD}>Field deployment</option>
              </select>
            </div>
            <Input name="driverName" label="Driver Name *" required placeholder="Your name" />
            <Input
              name="odoStart"
              label={checkoutVehicleId ? "ODO Reading (km) *" : "ODO Reading (km)"}
              type="number"
              required={!!checkoutVehicleId}
              placeholder={checkoutVehicleId ? "e.g. 271964" : "Fill once a vehicle is assigned"}
            />
            <Select name="departureLocation" label="Departing From *" required>
              {sites.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </Select>
            <Select name="destination" label="Final Destination *" required>
              <option value="">Select...</option>
              {sites.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
            </Select>
            <Select name="missionType" label="Mission Type *" required>
              {missionTypes.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </Select>
            <Input name="passengers" label="Passengers" placeholder="Names of passengers" />
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="text-sm font-medium text-zinc-700">Load Out (items leaving)</label>
              <textarea name="loadOut" rows={2} className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950" placeholder="e.g. 20x panels, 5x batteries, tools" />
            </div>
          </div>

          {!checkoutVehicleId && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              No vehicle selected. The trip will be created as <strong>pending fleet allocation</strong>.
              A fleet manager or approver can assign or reassign a vehicle later. ODO and trip-readiness
              gates will run once a vehicle is on the trip.
            </div>
          )}

          {checkoutVehicleId && (
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 space-y-2">
              <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">Trip readiness</div>
              {readinessLoading && <p className="text-sm text-zinc-500">Checking requirements…</p>}
              {!readinessLoading && readiness && (
                <ul className="space-y-2">
                  {readiness.gates.map((g) => (
                    <li key={g.id} className="flex gap-2 text-sm">
                      <span className={g.status === "satisfied" ? "text-emerald-600 shrink-0" : "text-amber-600 shrink-0"}>
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
                    href={`/vehicle-checks?vehicleId=${encodeURIComponent(checkoutVehicleId)}&returnTo=${encodeURIComponent(
                      "/trips",
                    )}`}
                    className="text-blue-600 underline font-medium"
                  >
                    Vehicle checks
                  </Link>
                  {" "}or{" "}
                  <Link
                    href={`/inspections?vehicleId=${encodeURIComponent(checkoutVehicleId)}&returnTo=${encodeURIComponent(
                      "/trips",
                    )}`}
                    className="text-blue-600 underline font-medium"
                  >
                    Inspections
                  </Link>
                  {" "}as needed, then return here.
                </p>
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
                      <span className="font-medium text-amber-900">
                        Manager / approver override
                      </span>
                      <span className="block text-xs text-amber-800">
                        Use sparingly. The override and your reason are logged in the audit trail
                        for this trip and visible to fleet managers.
                      </span>
                    </span>
                  </label>
                  {overrideEnabled && (
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      rows={2}
                      placeholder="Why are you bypassing the trip readiness gate? (e.g. emergency callout, vehicle inspection completed offline, etc.)"
                      className="w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    />
                  )}
                  {overrideEnabled && overrideReason.trim().length > 0 && overrideReason.trim().length < 8 && (
                    <p className="text-xs text-amber-700">
                      Reason needs at least 8 characters.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {checkoutError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {checkoutError}
            </div>
          )}

          {/* Multi-stop toggle */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsMultiStop(!isMultiStop)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isMultiStop ? "bg-blue-600" : "bg-zinc-200"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isMultiStop ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-sm text-zinc-600">Multi-stop itinerary</span>
          </div>

          {isMultiStop && (
            <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/20 p-4">
              <p className="text-xs font-medium text-zinc-500 uppercase">Intermediate Stops</p>
              {stops.map((stop, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-4 items-end">
                  <Select label={`Stop ${idx + 1}`} value={stop.location} onChange={(e) => updateStop(idx, "location", e.target.value)}>
                    <option value="">Select site...</option>
                    {sites.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                  </Select>
                  <Input label="Load Out" value={stop.loadOut} onChange={(e) => updateStop(idx, "loadOut", e.target.value)} placeholder="Drop off" />
                  <Input label="Load In" value={stop.loadIn} onChange={(e) => updateStop(idx, "loadIn", e.target.value)} placeholder="Pick up" />
                  <div className="flex gap-2">
                    <Input label="Notes" value={stop.notes} onChange={(e) => updateStop(idx, "notes", e.target.value)} placeholder="Notes" />
                    {stops.length > 1 && (
                      <button type="button" onClick={() => removeStop(idx)} className="text-red-400 hover:text-red-600 text-lg mt-6">✕</button>
                    )}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addStop}>+ Add Stop</Button>
            </div>
          )}

          <div className="flex gap-3 flex-wrap items-center">
            <Button type="submit" disabled={isSubmitting || submitBlocked} size="lg">
              {isSubmitting ? "Creating…" : "Create Trip"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            {submitBlocked && checkoutVehicleId && !readinessLoading && (
              <span className="text-xs text-amber-700">Complete all requirements above, or use the manager override, to create the trip.</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CheckinForm({ trip, sites, onComplete, onCancel }: {
  trip: TripRow;
  sites: RefItem[];
  onComplete: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      odoEnd: Number(fd.get("odoEnd")),
      arrivalLocation: fd.get("arrivalLocation"),
      issuesObserved: fd.get("issuesObserved"),
      loadIn: fd.get("loadIn"),
    };
    const res = await fetch(`/api/trips/${trip.id}/checkin`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) onComplete();
    else setIsSubmitting(false);
  }

  return (
    <Card className="border-emerald-200 bg-emerald-50/30">
      <CardHeader>
        <CardTitle>Check In: {trip.vehicle_code ?? "—"}</CardTitle>
        <p className="text-sm text-zinc-500">
          {trip.departure_location} → {trip.destination}
          {trip.odo_start != null ? ` · ODO out: ${Number(trip.odo_start).toLocaleString()} km` : ""}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <Input name="odoEnd" label="Current ODO (km) *" type="number" required placeholder="e.g. 272100" min={trip.odo_start ?? 0} />
          <Select name="arrivalLocation" label="Arrived At *" required>
            {sites.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </Select>
          <div>
            <label className="text-sm font-medium text-zinc-700">Load In (items returning)</label>
            <textarea name="loadIn" rows={2} className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950" placeholder="e.g. empty crates, samples" />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Issues Observed</label>
            <textarea name="issuesObserved" rows={2} className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950" placeholder="Any problems? (auto-creates maintenance alert)" />
          </div>
          <div className="sm:col-span-2 flex gap-3">
            <Button type="submit" disabled={isSubmitting} size="lg">{isSubmitting ? "Checking in..." : "Confirm Check-In"}</Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TripHistoryRow({ trip, organizationId, isExpanded, isEditing, isSaving, sites, missionTypes, onToggle, onEdit, onCancelEdit, onSave, onDelete }: {
  trip: TripRow;
  organizationId: string;
  isExpanded: boolean;
  isEditing: boolean;
  isSaving: boolean;
  sites: RefItem[];
  missionTypes: RefItem[];
  onToggle: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (e: React.FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
}): React.ReactElement {
  return (
    <>
      <tr
        id={`trip-row-${trip.id}`}
        className={`border-b border-zinc-100 cursor-pointer hover:bg-zinc-50 scroll-mt-24 ${isExpanded ? "bg-blue-50/50" : ""}`}
        onClick={onToggle}
      >
        <td className="py-2.5 pr-3 font-medium">{trip.vehicle_code || <span className="text-zinc-400 italic">pending</span>}</td>
        <td className="py-2.5 pr-3 text-zinc-600">{trip.departure_location} → {trip.arrival_location || trip.destination}</td>
        <td className="py-2.5 pr-3 hidden sm:table-cell text-zinc-600">{trip.driver_name || "—"}</td>
        <td className="py-2.5 pr-3 hidden md:table-cell text-zinc-600 capitalize">{(trip.mission_type || "").replace(/-/g, " ")}</td>
        <td className="py-2.5 pr-3 hidden lg:table-cell text-zinc-600 text-xs">
          {(trip.mission_profile || MISSION_PROFILE.LOCAL) === MISSION_PROFILE.FIELD ? "Field" : "Local"}
        </td>
        <td className="py-2.5 pr-3 font-medium">{trip.distance ? `${trip.distance} km` : "—"}</td>
        <td className="py-2.5 pr-3 hidden sm:table-cell text-zinc-400 text-xs">{new Date(trip.checkout_at).toLocaleDateString()}</td>
        <td className="py-2.5 text-zinc-400 text-xs">{isExpanded ? "▲" : "▼"}</td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <div className="border-t border-blue-100 bg-blue-50/20 p-4 space-y-4">
              {isEditing ? (
                <form onSubmit={onSave} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Input name="driverName" label="Driver Name" defaultValue={trip.driver_name} />
                    <Input name="odoStart" label="ODO Start (km)" type="number" defaultValue={trip.odo_start?.toString() ?? ""} />
                    <Input name="odoEnd" label="ODO End (km)" type="number" defaultValue={trip.odo_end?.toString() || ""} />
                    <Select name="departureLocation" label="Departure" defaultValue={trip.departure_location}>
                      {sites.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                    </Select>
                    <Select name="destination" label="Destination" defaultValue={trip.destination}>
                      {sites.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                    </Select>
                    <Select name="arrivalLocation" label="Arrived At" defaultValue={trip.arrival_location || ""}>
                      <option value="">—</option>
                      {sites.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                    </Select>
                    <Select name="missionType" label="Mission Type" defaultValue={trip.mission_type}>
                      {missionTypes.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
                    </Select>
                    <Select name="missionProfile" label="Trip kind" defaultValue={trip.mission_profile || MISSION_PROFILE.LOCAL}>
                      <option value={MISSION_PROFILE.LOCAL}>Local / in-town</option>
                      <option value={MISSION_PROFILE.FIELD}>Field deployment</option>
                    </Select>
                    <Input name="passengers" label="Passengers" defaultValue={trip.passengers} />
                    <div>
                      <label className="text-sm font-medium text-zinc-700">Load Out</label>
                      <textarea name="loadOut" defaultValue={trip.load_out} rows={2} className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-zinc-700">Load In</label>
                      <textarea name="loadIn" defaultValue={trip.load_in} rows={2} className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-zinc-700">Issues Observed</label>
                      <textarea name="issuesObserved" defaultValue={trip.issues_observed} rows={2} className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>
                    <Button type="button" variant="outline" size="sm" onClick={onCancelEdit}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium">Vehicle</div>
                      <div className="font-medium">
                        {trip.vehicle_code
                          ? `${trip.vehicle_code} — ${trip.vehicle_make ?? ""} ${trip.vehicle_model ?? ""}`.trim()
                          : <span className="text-amber-700">Pending fleet allocation</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium">Driver</div>
                      <div>{trip.driver_name || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium">Mission</div>
                      <div className="capitalize">{(trip.mission_type || "").replace(/-/g, " ")}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium">Trip kind</div>
                      <div>{(trip.mission_profile || MISSION_PROFILE.LOCAL) === MISSION_PROFILE.FIELD ? "Field deployment" : "Local / in-town"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium">Distance</div>
                      <div className="font-medium">{trip.distance ? `${trip.distance} km` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium">ODO Start → End</div>
                      <div>{trip.odo_start != null ? Number(trip.odo_start).toLocaleString() : "—"} → {trip.odo_end ? trip.odo_end.toLocaleString() : "—"} km</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium">Route</div>
                      <div>{trip.departure_location} → {trip.arrival_location || trip.destination}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium">Check Out</div>
                      <div>{new Date(trip.checkout_at).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium">Check In</div>
                      <div>{trip.checkin_at ? new Date(trip.checkin_at).toLocaleString() : "—"}</div>
                    </div>
                    {trip.passengers && (
                      <div>
                        <div className="text-xs text-zinc-500 uppercase font-medium">Passengers</div>
                        <div>{trip.passengers}</div>
                      </div>
                    )}
                    {trip.load_out && (
                      <div>
                        <div className="text-xs text-zinc-500 uppercase font-medium">Load Out</div>
                        <div>{trip.load_out}</div>
                      </div>
                    )}
                    {trip.load_in && (
                      <div>
                        <div className="text-xs text-zinc-500 uppercase font-medium">Load In</div>
                        <div>{trip.load_in}</div>
                      </div>
                    )}
                    {trip.issues_observed && (
                      <div className="sm:col-span-2">
                        <div className="text-xs text-zinc-500 uppercase font-medium">Issues Observed</div>
                        <div className="text-red-600">{trip.issues_observed}</div>
                      </div>
                    )}
                  </div>

                  <TripOdometerLog
                    tripId={trip.id}
                    organizationId={organizationId}
                    odoStart={trip.odo_start ?? 0}
                    active={false}
                    recordedById=""
                    recordedByName=""
                  />

                  <div className="pt-2">
                    <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Photos & Documents</div>
                    <MediaUpload entityType="trip" entityId={trip.id} />
                  </div>

                  <LoadoutManifestsSection
                    tripId={trip.id}
                    tripLabel={`${trip.vehicle_code} · ${new Date(trip.checkout_at).toLocaleDateString()}`}
                  />

                  <div className="flex gap-2 pt-2 border-t border-zinc-200">
                    <Button size="sm" variant="outline" onClick={onEdit}>Edit Trip</Button>
                    <Button size="sm" variant="outline" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); onDelete(); }}>Delete</Button>
                  </div>
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
