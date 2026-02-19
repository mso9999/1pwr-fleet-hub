"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { VehicleStatusBadge } from "@/components/StatusBadge";
import { VEHICLE_STATUS, ASSET_CLASS, TRACKER_STATUS } from "@/types";
import type { VehicleStatus, AssetClass, TrackerStatus } from "@/types";
import { MediaUpload } from "@/components/MediaUpload";

interface VehicleDetail {
  id: string;
  code: string;
  make: string;
  model: string;
  year: number | null;
  license_plate: string;
  vin: string;
  engine_number: string;
  asset_class: AssetClass;
  home_location: string;
  current_location: string;
  status: VehicleStatus;
  date_in_service: string;
  notes: string;
  tracker_imei: string;
  tracker_provider: string;
  tracker_sim: string;
  tracker_model: string;
  tracker_install_date: string;
  tracker_status: TrackerStatus;
  created_at: string;
  updated_at: string;
}

interface TrackingReport {
  id: string;
  vehicle_code: string;
  report_date: string;
  period_start: string;
  period_end: string;
  total_distance_km: number;
  total_trips: number;
  total_driving_hours: number;
  total_idle_hours: number;
  max_speed_kmh: number;
  avg_speed_kmh: number;
  geofence_violations: number;
  harsh_braking_events: number;
  harsh_acceleration_events: number;
  after_hours_usage_minutes: number;
  fuel_consumed_liters: number;
  start_location: string;
  end_location: string;
  report_source: string;
  notes: string;
}

const TRACKER_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-zinc-100 text-zinc-600",
  "no-signal": "bg-red-100 text-red-800",
  "not-installed": "bg-zinc-100 text-zinc-400",
  unknown: "bg-yellow-100 text-yellow-800",
};

export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }): React.ReactElement {
  const { id } = use(params);
  const router = useRouter();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingTracker, setIsEditingTracker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<TrackingReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState("");

  useEffect(() => {
    fetch(`/api/vehicles/${id}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setVehicle(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    if (!vehicle) return;
    setIsLoadingReports(true);
    fetch(`/api/vehicles/${id}/tracking-reports?limit=30`)
      .then((r) => r.json())
      .then((d) => { setReports(d); setIsLoadingReports(false); })
      .catch(() => setIsLoadingReports(false));
  }, [id, vehicle]);

  async function handleStatusChange(newStatus: string): Promise<void> {
    const res = await fetch(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setVehicle(updated);
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      code: fd.get("code"),
      make: fd.get("make"),
      model: fd.get("model"),
      year: fd.get("year") ? Number(fd.get("year")) : null,
      licensePlate: fd.get("licensePlate"),
      vin: fd.get("vin"),
      engineNumber: fd.get("engineNumber"),
      assetClass: fd.get("assetClass"),
      homeLocation: fd.get("homeLocation"),
      notes: fd.get("notes"),
    };

    const res = await fetch(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setVehicle(updated);
      setIsEditing(false);
    }
  }

  async function handleTrackerSave(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      trackerImei: fd.get("trackerImei"),
      trackerProvider: fd.get("trackerProvider"),
      trackerSim: fd.get("trackerSim"),
      trackerModel: fd.get("trackerModel"),
      trackerInstallDate: fd.get("trackerInstallDate"),
      trackerStatus: fd.get("trackerStatus"),
    };

    const res = await fetch(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setVehicle(updated);
      setIsEditingTracker(false);
    }
  }

  async function handleGenerateReport(): Promise<void> {
    setIsGenerating(true);
    setGenerateMsg("");
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch("/api/tracking-reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: id, reportDate: today, periodStart: today, periodEnd: today }),
    });
    const data = await res.json();
    if (res.ok) {
      setGenerateMsg(`Generated ${data.generated} report(s)`);
      const rRes = await fetch(`/api/vehicles/${id}/tracking-reports?limit=30`);
      if (rRes.ok) setReports(await rRes.json());
    } else {
      setGenerateMsg(data.error || "Failed to generate");
    }
    setIsGenerating(false);
  }

  if (isLoading) return <div className="text-zinc-500 text-center py-12">Loading...</div>;
  if (!vehicle) return <div className="text-red-500 text-center py-12">Vehicle not found</div>;

  const hasTracker = vehicle.tracker_imei && vehicle.tracker_imei.length > 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => router.push("/vehicles")}>← Back</Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{vehicle.code}</h2>
          <p className="text-sm text-zinc-500">{vehicle.make} {vehicle.model} {vehicle.year || ""}</p>
        </div>
        <VehicleStatusBadge status={vehicle.status} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Quick Status Change</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.values(VEHICLE_STATUS).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={vehicle.status === s ? "default" : "outline"}
                onClick={() => handleStatusChange(s)}
                disabled={vehicle.status === s}
              >
                {s}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Vehicle Details</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
              {isEditing ? "Cancel" : "Edit"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              <Input name="code" label="Code" defaultValue={vehicle.code} required />
              <Input name="make" label="Make" defaultValue={vehicle.make} />
              <Input name="model" label="Model" defaultValue={vehicle.model} />
              <Input name="year" label="Year" type="number" defaultValue={vehicle.year?.toString() || ""} />
              <Input name="licensePlate" label="License Plate" defaultValue={vehicle.license_plate} />
              <Input name="vin" label="VIN" defaultValue={vehicle.vin} />
              <Input name="engineNumber" label="Engine Number" defaultValue={vehicle.engine_number} />
              <Select name="assetClass" label="Asset Class" defaultValue={vehicle.asset_class}>
                {Object.values(ASSET_CLASS).map((c) => (
                  <option key={c} value={c}>{c.replace("-", " ")}</option>
                ))}
              </Select>
              <Input name="homeLocation" label="Home Location" defaultValue={vehicle.home_location} />
              <div className="sm:col-span-2">
                <label className="text-sm font-medium text-zinc-700">Notes</label>
                <textarea
                  name="notes"
                  defaultValue={vehicle.notes}
                  rows={3}
                  className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="Code" value={vehicle.code} />
              <InfoRow label="Make / Model" value={`${vehicle.make} ${vehicle.model}`} />
              <InfoRow label="Year" value={vehicle.year?.toString() || "—"} />
              <InfoRow label="License Plate" value={vehicle.license_plate || "—"} />
              <InfoRow label="VIN" value={vehicle.vin || "—"} />
              <InfoRow label="Engine Number" value={vehicle.engine_number || "—"} />
              <InfoRow label="Asset Class" value={vehicle.asset_class.replace("-", " ")} />
              <InfoRow label="Home Location" value={vehicle.home_location} />
              <InfoRow label="Current Location" value={vehicle.current_location} />
              <InfoRow label="Date in Service" value={vehicle.date_in_service || "—"} />
              {vehicle.notes && (
                <div className="sm:col-span-2">
                  <div className="text-xs font-medium text-zinc-500 uppercase">Notes</div>
                  <div className="mt-1 text-sm">{vehicle.notes}</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tracker Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle>Tracker Info</CardTitle>
              {hasTracker && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TRACKER_STATUS_COLORS[vehicle.tracker_status] || TRACKER_STATUS_COLORS.unknown}`}>
                  {vehicle.tracker_status}
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsEditingTracker(!isEditingTracker)}>
              {isEditingTracker ? "Cancel" : hasTracker ? "Edit" : "Add Tracker"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isEditingTracker ? (
            <form onSubmit={handleTrackerSave} className="grid gap-4 sm:grid-cols-2">
              <Input name="trackerImei" label="IMEI Number" defaultValue={vehicle.tracker_imei} placeholder="e.g. 350612345678901" />
              <Input name="trackerProvider" label="Provider" defaultValue={vehicle.tracker_provider} placeholder="e.g. Ctrack, Netstar, MiX" />
              <Input name="trackerSim" label="SIM Number" defaultValue={vehicle.tracker_sim} placeholder="SIM card number" />
              <Input name="trackerModel" label="Device Model" defaultValue={vehicle.tracker_model} placeholder="e.g. GL300W" />
              <Input name="trackerInstallDate" label="Install Date" type="date" defaultValue={vehicle.tracker_install_date} />
              <Select name="trackerStatus" label="Tracker Status" defaultValue={vehicle.tracker_status}>
                {Object.values(TRACKER_STATUS).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
              <div className="sm:col-span-2">
                <Button type="submit">Save Tracker Info</Button>
              </div>
            </form>
          ) : hasTracker ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="IMEI" value={vehicle.tracker_imei} />
              <InfoRow label="Provider" value={vehicle.tracker_provider || "—"} />
              <InfoRow label="SIM Number" value={vehicle.tracker_sim || "—"} />
              <InfoRow label="Device Model" value={vehicle.tracker_model || "—"} />
              <InfoRow label="Install Date" value={vehicle.tracker_install_date || "—"} />
              <InfoRow label="Status" value={vehicle.tracker_status} />
            </div>
          ) : (
            <p className="text-sm text-zinc-400">No tracker assigned. Click &quot;Add Tracker&quot; to enter IMEI and provider details.</p>
          )}
        </CardContent>
      </Card>

      {/* Tracking Reports Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Tracking Reports</CardTitle>
            <div className="flex items-center gap-2">
              {generateMsg && <span className="text-xs text-zinc-500">{generateMsg}</span>}
              <Button variant="outline" size="sm" onClick={handleGenerateReport} disabled={isGenerating || !hasTracker || vehicle.tracker_status !== "active"}>
                {isGenerating ? "Generating..." : "Generate Today"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!hasTracker ? (
            <p className="text-sm text-zinc-400">Add a tracker to this vehicle to generate tracking reports.</p>
          ) : isLoadingReports ? (
            <p className="text-sm text-zinc-500">Loading reports...</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-zinc-400">No tracking reports yet. Click &quot;Generate Today&quot; to create one from trip data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-zinc-500 uppercase">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Distance</th>
                    <th className="pb-2 pr-4">Trips</th>
                    <th className="pb-2 pr-4">Driving Hrs</th>
                    <th className="pb-2 pr-4">Idle Hrs</th>
                    <th className="pb-2 pr-4">Max Speed</th>
                    <th className="pb-2 pr-4">Avg Speed</th>
                    <th className="pb-2 pr-4">Geofence</th>
                    <th className="pb-2 pr-4">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="py-2 pr-4 font-medium">{r.report_date}</td>
                      <td className="py-2 pr-4">{r.total_distance_km.toFixed(1)} km</td>
                      <td className="py-2 pr-4">{r.total_trips}</td>
                      <td className="py-2 pr-4">{r.total_driving_hours.toFixed(1)}</td>
                      <td className="py-2 pr-4">{r.total_idle_hours.toFixed(1)}</td>
                      <td className="py-2 pr-4">{r.max_speed_kmh > 0 ? `${r.max_speed_kmh.toFixed(0)} km/h` : "—"}</td>
                      <td className="py-2 pr-4">{r.avg_speed_kmh > 0 ? `${r.avg_speed_kmh.toFixed(0)} km/h` : "—"}</td>
                      <td className="py-2 pr-4">
                        {r.geofence_violations > 0 ? (
                          <span className="text-red-600 font-medium">{r.geofence_violations}</span>
                        ) : "0"}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${r.report_source === "auto-generated" ? "bg-blue-100 text-blue-700" : r.report_source === "tracker-api" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-600"}`}>
                          {r.report_source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Media Attachments */}
      <Card>
        <CardHeader>
          <CardTitle>Photos & Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <MediaUpload entityType="vehicle" entityId={id} />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <div className="text-xs font-medium text-zinc-500 uppercase">{label}</div>
      <div className="mt-1 text-sm font-medium capitalize">{value}</div>
    </div>
  );
}
