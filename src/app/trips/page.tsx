"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { MediaUpload } from "@/components/MediaUpload";

interface TripRow {
  id: string;
  vehicle_id: string;
  vehicle_code: string;
  vehicle_make: string;
  vehicle_model: string;
  driver_name: string;
  odo_start: number;
  odo_end: number | null;
  departure_location: string;
  destination: string;
  arrival_location: string;
  mission_type: string;
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

export default function TripsPage(): React.ReactElement {
  const { organizationId } = useAuth();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{activeTrips.length} active · {completedTrips.length} completed</p>
        <Button onClick={() => setShowCheckout(!showCheckout)} size="lg">+ Check Out Vehicle</Button>
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
                <div key={trip.id} className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <Badge variant="info">{trip.vehicle_code}</Badge>
                      {trip.vehicle_make} {trip.vehicle_model}
                    </div>
                    <div className="text-sm text-zinc-600 mt-1">
                      {trip.departure_location} → {trip.destination}
                      {trip.load_out && <span className="ml-2 text-xs text-amber-600">Load: {trip.load_out}</span>}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Driver: {trip.driver_name || "—"} · ODO: {trip.odo_start.toLocaleString()} km
                      · Out: {new Date(trip.checkout_at).toLocaleString()}
                      {trip.source !== "manual" && <Badge variant="secondary" className="ml-2 text-[10px]">{trip.source}</Badge>}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setCheckinTrip(trip)}>Check In</Button>
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

function CheckoutForm({ vehicles, sites, missionTypes, organizationId, onComplete, onCancel }: {
  vehicles: VehicleOption[];
  sites: RefItem[];
  missionTypes: RefItem[];
  organizationId: string;
  onComplete: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMultiStop, setIsMultiStop] = useState(false);
  const [stops, setStops] = useState<StopInput[]>([{ location: "", loadOut: "", loadIn: "", notes: "" }]);

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
      passengers: fd.get("passengers"),
      loadOut: fd.get("loadOut"),
    };

    if (isMultiStop && stops.some((s) => s.location)) {
      body.stops = stops.filter((s) => s.location);
    }

    const res = await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) onComplete();
    else setIsSubmitting(false);
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader><CardTitle>Check Out Vehicle</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select name="vehicleId" label="Vehicle *" required>
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.code} — {v.make} {v.model} ({v.current_location})</option>
              ))}
            </Select>
            <Input name="driverName" label="Driver Name *" required placeholder="Your name" />
            <Input name="odoStart" label="ODO Reading (km) *" type="number" required placeholder="e.g. 271964" />
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

          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting} size="lg">{isSubmitting ? "Checking out..." : "Confirm Check-Out"}</Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
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
        <CardTitle>Check In: {trip.vehicle_code}</CardTitle>
        <p className="text-sm text-zinc-500">{trip.departure_location} → {trip.destination} · ODO out: {trip.odo_start.toLocaleString()} km</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <Input name="odoEnd" label="Current ODO (km) *" type="number" required placeholder="e.g. 272100" min={trip.odo_start} />
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

function TripHistoryRow({ trip, isExpanded, isEditing, isSaving, sites, missionTypes, onToggle, onEdit, onCancelEdit, onSave, onDelete }: {
  trip: TripRow;
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
      <tr className={`border-b border-zinc-100 cursor-pointer hover:bg-zinc-50 ${isExpanded ? "bg-blue-50/50" : ""}`} onClick={onToggle}>
        <td className="py-2.5 pr-3 font-medium">{trip.vehicle_code}</td>
        <td className="py-2.5 pr-3 text-zinc-600">{trip.departure_location} → {trip.arrival_location || trip.destination}</td>
        <td className="py-2.5 pr-3 hidden sm:table-cell text-zinc-600">{trip.driver_name || "—"}</td>
        <td className="py-2.5 pr-3 hidden md:table-cell text-zinc-600 capitalize">{(trip.mission_type || "").replace(/-/g, " ")}</td>
        <td className="py-2.5 pr-3 font-medium">{trip.distance ? `${trip.distance} km` : "—"}</td>
        <td className="py-2.5 pr-3 hidden sm:table-cell text-zinc-400 text-xs">{new Date(trip.checkout_at).toLocaleDateString()}</td>
        <td className="py-2.5 text-zinc-400 text-xs">{isExpanded ? "▲" : "▼"}</td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <div className="border-t border-blue-100 bg-blue-50/20 p-4 space-y-4">
              {isEditing ? (
                <form onSubmit={onSave} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Input name="driverName" label="Driver Name" defaultValue={trip.driver_name} />
                    <Input name="odoStart" label="ODO Start (km)" type="number" defaultValue={trip.odo_start.toString()} />
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
                      <div className="font-medium">{trip.vehicle_code} — {trip.vehicle_make} {trip.vehicle_model}</div>
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
                      <div className="text-xs text-zinc-500 uppercase font-medium">Distance</div>
                      <div className="font-medium">{trip.distance ? `${trip.distance} km` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 uppercase font-medium">ODO Start → End</div>
                      <div>{trip.odo_start.toLocaleString()} → {trip.odo_end ? trip.odo_end.toLocaleString() : "—"} km</div>
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

                  <div className="pt-2">
                    <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Photos & Documents</div>
                    <MediaUpload entityType="trip" entityId={trip.id} />
                  </div>

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
