"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { MediaUpload } from "@/components/MediaUpload";
import { LoadoutManifestsSection } from "@/components/LoadoutManifestsSection";
import { TripOdometerLog } from "@/components/TripOdometerLog";
import { MISSION_PROFILE } from "@/lib/trip-readiness";
import { TripCheckoutForm } from "./checkout-form";
import { useTutorial } from "@/components/tutorial/tutorial-context";

interface TripRow {
  id: string;
  mission_id?: string | null;
  mission_title?: string | null;
  mission_approval_status?: string | null;
  mission_lifecycle_status?: string | null;
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
  trip_shape?: string;
  mission_profile?: string;
  passengers: string;
  load_out: string;
  load_in: string;
  checkout_at: string;
  checkin_at: string | null;
  planned_departure_date?: string | null;
  departed_at?: string | null;
  departure_confirmed_by_name?: string | null;
  departure_discrepancy?: string | null;
  issues_observed: string;
  distance: number | null;
  source: string;
  stops?: Array<{
    id: string;
    stop_number: number;
    location: string;
    arrived_at: string | null;
    departed_at: string | null;
    odo_reading: number | null;
    load_out: string;
    load_in: string;
    notes: string;
  }>;
}

interface RefItem { code: string; label: string; }
function tripShapeLabel(shape?: string): string {
  const s = String(shape || "").toLowerCase();
  if (s === "round_trip") return "Round trip";
  if (s === "multi_stop") return "Multi-stop";
  return "One-way";
}

interface ParsedDiscrepancy {
  discrepancy: boolean;
  detail: string;
  firstMovedAt: string | null;
  trackerAvailable: boolean;
}

function parseDepartureDiscrepancy(raw: string | null | undefined): ParsedDiscrepancy | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ParsedDiscrepancy;
    if (parsed && typeof parsed.detail === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Mission-gate badge for the Start trip button. Reflects the policy-hard
 * gate from /api/trips/[id]/depart + evaluateReadinessForMissionLinkedTrip:
 * the mission must be linked, approved, and active before a vehicle can
 * depart. DVC freshness / mechanical gates stay override-able and are
 * surfaced inside the Start trip modal instead — this badge is the cheap
 * at-a-glance status so dispatch sees whether the mission paperwork is
 * done before clicking in.
 */
function missionGateBadge(trip: TripRow): {
  label: string;
  className: string;
  title: string;
} | null {
  if (trip.departed_at) return null; // already departed — no badge needed
  if (!trip.mission_id) {
    return {
      label: "Mission not linked",
      className: "border-red-200 bg-red-50 text-red-800",
      title: "Trip has no linked mission. Dispatch must attach an approved mission before this vehicle can deploy.",
    };
  }
  const approval = String(trip.mission_approval_status || "").toLowerCase();
  const lifecycle = String(trip.mission_lifecycle_status || "active").toLowerCase();
  if (approval !== "approved") {
    return {
      label: `Mission ${approval || "pending"}`,
      className: "border-red-200 bg-red-50 text-red-800",
      title: `Mission approval_status = '${approval || "pending"}'. A manager must approve the mission before departure (this gate cannot be overridden).`,
    };
  }
  if (lifecycle !== "active") {
    return {
      label: `Mission ${lifecycle}`,
      className: "border-red-200 bg-red-50 text-red-800",
      title: `Mission lifecycle_status = '${lifecycle}'. Only active missions can deploy.`,
    };
  }
  return {
    label: "Mission approved",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    title: "Mission is approved and active. Operational gates (DVC, mechanical) will be checked when you click Start trip.",
  };
}
function TripsPageContent(): React.ReactElement {
  const { active, trackId, stepIndex } = useTutorial();
  const searchParams = useSearchParams();
  const tripParam = searchParams.get("trip");
  const vehicleParam = searchParams.get("vehicle");
  const { organizationId, user } = useAuth();
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [sites, setSites] = useState<RefItem[]>([]);
  const [missionTypes, setMissionTypes] = useState<RefItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkinTrip, setCheckinTrip] = useState<TripRow | null>(null);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);
  const [editingTrip, setEditingTrip] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [departTrip, setDepartTrip] = useState<TripRow | null>(null);
  const [isDeparting, setIsDeparting] = useState(false);

  const loadTrips = useCallback(() => {
    fetch(`/api/trips?org=${organizationId}&includeStops=true`)
      .then((r) => r.json())
      .then((d) => { setTrips(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [organizationId]);

  useEffect(() => {
    loadTrips();
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
      tripShape: fd.get("tripShape"),
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

  async function markStopEvent(tripId: string, stopId: string, action: "arrive" | "depart"): Promise<void> {
    const odoRaw = window.prompt("Optional ODO reading at this stop (km):");
    const odoReading = odoRaw && odoRaw.trim() ? Number(odoRaw) : null;
    const payload: Record<string, unknown> = { action };
    if (odoReading !== null && Number.isFinite(odoReading)) payload.odoReading = odoReading;
    const res = await fetch(`/api/trips/${tripId}/stops/${stopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) loadTrips();
  }

  async function confirmDepart(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!departTrip) return;
    setIsDeparting(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    const odoRaw = String(fd.get("actualOdoStart") || "").trim();
    if (odoRaw) body.actualOdoStart = Number(odoRaw);
    const overrideReason = String(fd.get("overrideReason") || "").trim();
    if (overrideReason) body.overrideReason = overrideReason;
    const departedAtRaw = String(fd.get("departedAt") || "").trim();
    if (departedAtRaw) body.departedAt = departedAtRaw;
    const res = await fetch(`/api/trips/${departTrip.id}/depart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setIsDeparting(false);
    if (res.ok) {
      setDepartTrip(null);
      loadTrips();
    } else {
      const data = await res.json().catch(() => ({}));
      const gates = Array.isArray((data as Record<string, unknown>).gates)
        ? ((data as Record<string, unknown>).gates as Array<{ label: string; detail: string }>)
        : [];
      const gateText = gates.length
        ? gates.map((g) => `• ${g.label}: ${g.detail}`).join("\n")
        : "";
      window.alert(
        `Could not register departure:\n${String((data as Record<string, unknown>).error || "Unknown error")}${
          gateText ? `\n\n${gateText}` : ""
        }`
      );
    }
  }

  const activeTrips = trips.filter((t) => !t.checkin_at);
  const completedTrips = trips.filter((t) => t.checkin_at);

  useEffect(() => {
    if (!active || trackId !== "fieldDeployment") return;
    if (stepIndex >= 8) setShowCheckout(true);
    else setShowCheckout(false);
  }, [active, trackId, stepIndex]);

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
        Every check-out is tied to an <strong>approved mission</strong> with a <strong>fleet-reserved vehicle</strong>. Create and approve the mission on{" "}
        <Link href="/vehicle-requests" className="text-blue-600 underline font-medium">Missions</Link>
        {" "}first, then reserve the vehicle, then start the trip here. If you change mission parameters while checking out, management may need to re-approve.
        <strong> Local</strong> missions skip the departing driver checklist; <strong>field</strong> missions require today&apos;s{" "}
        <Link href="/vehicle-checks" className="text-blue-600 underline font-medium">departing driver checklist</Link>.
        If the reserved unit is not operational, fleet can place the mission on <strong>checkout hold</strong> (management is alerted).{" "}
        <span className="font-medium text-zinc-800">Daily ODO: </span>
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
        <TripCheckoutForm
          sites={sites}
          missionTypes={missionTypes}
          organizationId={organizationId}
          user={user}
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

      {departTrip && (
        <DepartureForm
          trip={departTrip}
          isSubmitting={isDeparting}
          onSubmit={confirmDepart}
          onCancel={() => setDepartTrip(null)}
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
                        <Badge variant="secondary" className="text-[10px]">
                          {tripShapeLabel(trip.trip_shape)}
                        </Badge>
                      </div>
                      <div className="text-sm text-zinc-600 mt-1">
                        {trip.departure_location} → {trip.destination}
                        {trip.load_out && <span className="ml-2 text-xs text-amber-600">Load: {trip.load_out}</span>}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        Driver: {trip.driver_name || "—"}
                        {trip.odo_start != null ? ` · ODO: ${Number(trip.odo_start).toLocaleString()} km` : ""}
                        · Checked out: {new Date(trip.checkout_at).toLocaleString()}
                        {trip.departed_at
                          ? ` · Departed: ${new Date(trip.departed_at).toLocaleString()}`
                          : " · Departed: pending"}
                        {trip.planned_departure_date ? ` · Planned: ${trip.planned_departure_date}` : ""}
                        {trip.source !== "manual" && <Badge variant="secondary" className="ml-2 text-[10px]">{trip.source}</Badge>}
                      </div>
                      {(() => {
                        const discrepancy = parseDepartureDiscrepancy(trip.departure_discrepancy);
                        if (!discrepancy) return null;
                        return (
                          <div
                            className={`mt-2 rounded border px-2.5 py-1.5 text-xs ${
                              discrepancy.discrepancy
                                ? "border-amber-300 bg-amber-50 text-amber-900"
                                : "border-emerald-200 bg-emerald-50 text-emerald-900"
                            }`}
                          >
                            <span className="font-medium">Tracker cross-check: </span>
                            {discrepancy.detail}
                          </div>
                        );
                      })()}
                    </div>
                    {trip.vehicle_code ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {!trip.departed_at && (() => {
                          const b = missionGateBadge(trip);
                          return b ? (
                            <Badge variant="secondary" className={`text-[10px] ${b.className}`} title={b.title}>
                              {b.label}
                            </Badge>
                          ) : null;
                        })()}
                        {!trip.departed_at && (
                          <Button size="sm" variant="outline" onClick={() => setDepartTrip(trip)}>
                            Start trip
                          </Button>
                        )}
                        <Button size="sm" onClick={() => setCheckinTrip(trip)}>Check In</Button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-500">Awaiting fleet allocation</span>
                    )}
                  </div>
                  <div className="px-4 pb-4 space-y-3">
                    {Array.isArray(trip.stops) && trip.stops.length > 0 && (
                      <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
                        <div className="text-xs font-medium text-zinc-500 uppercase">Stop execution</div>
                        {trip.stops.map((s) => (
                          <div key={s.id} className="rounded border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-medium text-zinc-800">
                                Stop {s.stop_number}: {s.location}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {!s.arrived_at && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[11px]"
                                    onClick={() => void markStopEvent(trip.id, s.id, "arrive")}
                                  >
                                    Mark arrived
                                  </Button>
                                )}
                                {s.arrived_at && !s.departed_at && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[11px]"
                                    onClick={() => void markStopEvent(trip.id, s.id, "depart")}
                                  >
                                    Mark departed
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="mt-1 text-zinc-600">
                              Arrived: {s.arrived_at ? new Date(s.arrived_at).toLocaleString() : "—"} · Departed:{" "}
                              {s.departed_at ? new Date(s.departed_at).toLocaleString() : "—"}
                              {s.odo_reading != null ? ` · ODO ${Number(s.odo_reading).toLocaleString()} km` : ""}
                            </div>
                            {(s.load_out || s.load_in || s.notes) && (
                              <div className="mt-1 text-zinc-700">
                                {s.load_out ? `Load out: ${s.load_out}` : ""}
                                {s.load_in ? `${s.load_out ? " · " : ""}Load in: ${s.load_in}` : ""}
                                {s.notes ? `${s.load_out || s.load_in ? " · " : ""}${s.notes}` : ""}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <LoadoutManifestsSection
                      tripId={trip.id}
                      tripStops={trip.stops || []}
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

function DepartureForm({
  trip,
  isSubmitting,
  onSubmit,
  onCancel,
}: {
  trip: TripRow;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader>
        <CardTitle>Start trip / Depart now: {trip.vehicle_code ?? "—"}</CardTitle>
        <p className="text-sm text-zinc-500">
          {trip.departure_location} → {trip.destination}
          {trip.planned_departure_date ? ` · Planned departure: ${trip.planned_departure_date}` : ""}
          {trip.odo_start != null ? ` · Checkout ODO: ${Number(trip.odo_start).toLocaleString()} km` : ""}
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          Records the actual date and time of departure. If a pre-departure checklist is older than
          24 hours, the readiness gate will block this until an approver provides an override reason.
          For tracked vehicles, the system will cross-check the tracker history against the planned
          departure date and flag any discrepancy. To record a departure that happened on a prior
          day, set the departure date below — the audit log will always show the real time you made
          this entry.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <Input
            name="departedAt"
            label="Departure date (leave as today for real-time)"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
          />
          <Input
            name="actualOdoStart"
            label="Actual ODO at departure (km)"
            type="number"
            placeholder={trip.odo_start != null ? String(trip.odo_start) : "e.g. 154200"}
            defaultValue={trip.odo_start != null ? String(trip.odo_start) : ""}
            min={0}
          />
          <div>
            <label className="text-sm font-medium text-zinc-700">Override reason (optional)</label>
            <textarea
              name="overrideReason"
              rows={2}
              className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              placeholder="Only if the readiness gate is blocked and an approver is authorizing the departure."
            />
          </div>
          <div className="sm:col-span-2 flex gap-3">
            <Button type="submit" disabled={isSubmitting} size="lg">
              {isSubmitting ? "Recording departure..." : "Confirm departure"}
            </Button>
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
                    <Select name="tripShape" label="Trip shape" defaultValue={trip.trip_shape || "one_way"}>
                      <option value="one_way">One-way</option>
                      <option value="round_trip">Round trip</option>
                      <option value="multi_stop">Multi-stop</option>
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
                      <div className="text-xs text-zinc-500 uppercase font-medium">Trip shape</div>
                      <div>{tripShapeLabel(trip.trip_shape)}</div>
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
                      <div className="text-xs text-zinc-500 uppercase font-medium">Departed</div>
                      <div>{trip.departed_at ? new Date(trip.departed_at).toLocaleString() : "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium">Check In</div>
                      <div>{trip.checkin_at ? new Date(trip.checkin_at).toLocaleString() : "—"}</div>
                    </div>
                    {(() => {
                      const discrepancy = parseDepartureDiscrepancy(trip.departure_discrepancy);
                      if (!discrepancy) return null;
                      return (
                        <div className="sm:col-span-2">
                          <div className="text-xs text-zinc-500 uppercase font-medium">Tracker cross-check</div>
                          <div
                            className={
                              discrepancy.discrepancy ? "text-amber-700" : "text-emerald-700"
                            }
                          >
                            {discrepancy.detail}
                          </div>
                        </div>
                      );
                    })()}
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

                  {Array.isArray(trip.stops) && trip.stops.length > 0 && (
                    <div className="rounded-lg border border-zinc-200 bg-white p-3">
                      <div className="text-xs text-zinc-500 uppercase font-medium mb-2">Stop timeline</div>
                      <ul className="space-y-1.5 text-xs text-zinc-700">
                        {trip.stops.map((s) => (
                          <li key={s.id}>
                            <span className="font-medium">#{s.stop_number} {s.location}</span>
                            <span className="text-zinc-500 ml-2">
                              Arrived {s.arrived_at ? new Date(s.arrived_at).toLocaleString() : "—"} · Departed{" "}
                              {s.departed_at ? new Date(s.departed_at).toLocaleString() : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

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
                    tripStops={trip.stops || []}
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

export default function TripsPage(): React.ReactElement {
  return (
    <Suspense fallback={<p className="text-zinc-500 text-center py-12">Loading trips…</p>}>
      <TripsPageContent />
    </Suspense>
  );
}
