"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { VehicleStatusBadge } from "@/components/StatusBadge";
import type { VehicleStatus, AssetClass } from "@/types";
import { VEHICLE_STATUS, ASSET_CLASS } from "@/types";
import { useAuth } from "@/lib/auth-context";

interface VehicleRow {
  id: string;
  code: string;
  make: string;
  model: string;
  year: number | null;
  license_plate: string;
  asset_class: AssetClass;
  home_location: string;
  current_location: string;
  status: VehicleStatus;
}

export default function VehiclesPage(): React.ReactElement {
  const { organizationId } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const loadVehicles = useCallback(() => {
    const params = new URLSearchParams();
    params.set("org", organizationId);
    if (filterStatus) params.set("status", filterStatus);
    fetch(`/api/vehicles?${params}`)
      .then((r) => r.json())
      .then((d) => { setVehicles(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [filterStatus, organizationId]);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {Object.values(VEHICLE_STATUS).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <span className="text-sm text-zinc-500">{vehicles.length} vehicles</span>
        </div>
        <Button onClick={() => setIsAddOpen(!isAddOpen)}>
          + Add Vehicle
        </Button>
      </div>

      {isAddOpen && <AddVehicleForm onAdded={() => { setIsAddOpen(false); loadVehicles(); }} onCancel={() => setIsAddOpen(false)} />}

      {isLoading ? (
        <div className="text-zinc-500 text-center py-12">Loading vehicles...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                <th className="pb-3 pr-4">Code</th>
                <th className="pb-3 pr-4">Vehicle</th>
                <th className="pb-3 pr-4 hidden sm:table-cell">License</th>
                <th className="pb-3 pr-4 hidden md:table-cell">Class</th>
                <th className="pb-3 pr-4">Location</th>
                <th className="pb-3 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                  <td className="py-3 pr-4">
                    <Link href={`/vehicles/${v.id}`} className="font-bold text-blue-600 hover:underline text-base">
                      {v.code}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{v.make} {v.model}</div>
                    {v.year && <div className="text-xs text-zinc-400">{v.year}</div>}
                  </td>
                  <td className="py-3 pr-4 hidden sm:table-cell text-zinc-600">{v.license_plate || "—"}</td>
                  <td className="py-3 pr-4 hidden md:table-cell text-zinc-600 capitalize">{v.asset_class.replace("-", " ")}</td>
                  <td className="py-3 pr-4 text-zinc-600">{v.current_location}</td>
                  <td className="py-3 pr-4"><VehicleStatusBadge status={v.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddVehicleForm({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }): React.ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      code: fd.get("code"),
      make: fd.get("make"),
      model: fd.get("model"),
      year: fd.get("year") ? Number(fd.get("year")) : null,
      licensePlate: fd.get("licensePlate"),
      assetClass: fd.get("assetClass"),
      homeLocation: fd.get("homeLocation"),
      status: fd.get("status"),
    };

    const res = await fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      onAdded();
    } else {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Add New Vehicle</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input name="code" label="Code *" placeholder="e.g. R1" required />
          <Input name="make" label="Make" placeholder="e.g. Ford" />
          <Input name="model" label="Model" placeholder="e.g. Ranger" />
          <Input name="year" label="Year" type="number" placeholder="e.g. 2008" />
          <Input name="licensePlate" label="License Plate" placeholder="e.g. A 838 BCF" />
          <Select name="assetClass" label="Asset Class" defaultValue="light-vehicle">
            {Object.values(ASSET_CLASS).map((c) => (
              <option key={c} value={c}>{c.replace("-", " ")}</option>
            ))}
          </Select>
          <Input name="homeLocation" label="Home Location" placeholder="HQ" defaultValue="HQ" />
          <Select name="status" label="Status" defaultValue="operational">
            {Object.values(VEHICLE_STATUS).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <div className="sm:col-span-2 lg:col-span-4 flex gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Vehicle"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
