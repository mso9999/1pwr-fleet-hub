"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { VehicleStatusBadge } from "@/components/StatusBadge";
import type { VehicleStatus, AssetClass } from "@/types";
import { VEHICLE_STATUS, ASSET_CLASS, ASSET_CLASS_LABELS, assetClassLabel } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { registrationDiscDashboardTier } from "@/lib/registration-disc";

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
  photo_url?: string | null;
  registration_disc_expiry_date?: string | null;
}

type VehiclesViewMode = "tiles" | "list";
const VIEW_STORAGE_KEY = "fleet-vehicles-view";

interface VehicleFilterOptions {
  assetClasses: string[];
  currentLocations: string[];
  homeLocations: string[];
  pools: string[];
}

export default function VehiclesPage(): React.ReactElement {
  const { organizationId } = useAuth();
  const todayYmd = new Date().toISOString().slice(0, 10);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<VehiclesViewMode>("tiles");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssetClass, setFilterAssetClass] = useState("");
  const [filterPool, setFilterPool] = useState("");
  const [filterCurrentLocation, setFilterCurrentLocation] = useState("");
  const [filterHomeLocation, setFilterHomeLocation] = useState("");
  const [filterOptions, setFilterOptions] = useState<VehicleFilterOptions>({
    assetClasses: [],
    currentLocations: [],
    homeLocations: [],
    pools: [],
  });
  const [isAddOpen, setIsAddOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "list" || saved === "tiles") setViewMode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function changeView(mode: VehiclesViewMode): void {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  const loadVehicles = useCallback(() => {
    const params = new URLSearchParams();
    params.set("org", organizationId);
    if (filterStatus) params.set("status", filterStatus);
    if (filterAssetClass) params.set("assetClass", filterAssetClass);
    if (filterPool) params.set("pool", filterPool);
    if (filterCurrentLocation) params.set("currentLocation", filterCurrentLocation);
    if (filterHomeLocation) params.set("homeLocation", filterHomeLocation);
    fetch(`/api/vehicles?${params}`)
      .then((r) => r.json())
      .then((d) => { setVehicles(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [
    filterStatus,
    filterAssetClass,
    filterPool,
    filterCurrentLocation,
    filterHomeLocation,
    organizationId,
  ]);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  useEffect(() => {
    fetch(`/api/vehicles/filter-options?org=${encodeURIComponent(organizationId)}`)
      .then((r) => r.json())
      .then((d: VehicleFilterOptions) => {
        setFilterOptions({
          assetClasses: Array.isArray(d.assetClasses) ? d.assetClasses : [],
          currentLocations: Array.isArray(d.currentLocations) ? d.currentLocations : [],
          homeLocations: Array.isArray(d.homeLocations) ? d.homeLocations : [],
          pools: Array.isArray(d.pools) ? d.pools : [],
        });
      })
      .catch(() => {});
  }, [organizationId]);

  const hasActiveFilters =
    !!filterStatus ||
    !!filterAssetClass ||
    !!filterPool ||
    !!filterCurrentLocation ||
    !!filterHomeLocation;

  function clearFilters(): void {
    setFilterStatus("");
    setFilterAssetClass("");
    setFilterPool("");
    setFilterCurrentLocation("");
    setFilterHomeLocation("");
  }

  const assetClassFilterOptions =
    filterOptions.assetClasses.length > 0
      ? filterOptions.assetClasses
      : (Object.values(ASSET_CLASS) as string[]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3" data-tutorial="tutorial-vehicles-header">
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <Select label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="min-w-[140px]">
            <option value="">All</option>
            {Object.values(VEHICLE_STATUS).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select label="Category" value={filterAssetClass} onChange={(e) => setFilterAssetClass(e.target.value)} className="min-w-[180px]">
            <option value="">All</option>
            {assetClassFilterOptions.map((c) => (
              <option key={c} value={c}>{assetClassLabel(c)}</option>
            ))}
          </Select>
          <Select
            label="Current location"
            value={filterCurrentLocation}
            onChange={(e) => setFilterCurrentLocation(e.target.value)}
            className="min-w-[140px]"
          >
            <option value="">All</option>
            {filterOptions.currentLocations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </Select>
          <Select
            label="Home location"
            value={filterHomeLocation}
            onChange={(e) => setFilterHomeLocation(e.target.value)}
            className="min-w-[140px]"
          >
            <option value="">All</option>
            {filterOptions.homeLocations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </Select>
          {filterOptions.pools.length > 0 && (
            <Select label="Pool" value={filterPool} onChange={(e) => setFilterPool(e.target.value)} className="min-w-[120px]">
              <option value="">All</option>
              {filterOptions.pools.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          )}
          {hasActiveFilters && (
            <Button type="button" variant="outline" size="sm" className="mb-0.5" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
          <span className="text-sm text-zinc-500 pb-2 sm:ml-1">{vehicles.length} vehicles</span>
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 mb-0.5" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => changeView("tiles")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                viewMode === "tiles" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              Tiles
            </button>
            <button
              type="button"
              onClick={() => changeView("list")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                viewMode === "list" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              List
            </button>
          </div>
        </div>
        <span data-tutorial="tutorial-vehicles-add">
          <Button onClick={() => setIsAddOpen(!isAddOpen)}>
            + Add Vehicle
          </Button>
        </span>
      </div>

      {isAddOpen && (
        <AddVehicleForm
          organizationId={organizationId}
          onAdded={() => {
            setIsAddOpen(false);
            loadVehicles();
          }}
          onCancel={() => setIsAddOpen(false)}
        />
      )}

      {isLoading ? (
        <div className="text-zinc-500 text-center py-12">Loading vehicles...</div>
      ) : viewMode === "tiles" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {vehicles.map((v, idx) => (
            <Link
              key={v.id}
              href={`/vehicles/${v.id}`}
              className="group rounded-xl border border-zinc-200 bg-white overflow-hidden hover:border-zinc-300 hover:shadow-sm transition-all"
              data-tutorial={idx === 0 ? "tutorial-vehicles-first-link" : undefined}
            >
              <div className="aspect-square bg-zinc-100 relative">
                {v.photo_url ? (
                  <img
                    src={v.photo_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-400 px-2 text-center">
                    <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-[11px]">No ortho</span>
                  </div>
                )}
                <div className="absolute top-1.5 right-1.5">
                  <VehicleStatusBadge status={v.status} />
                </div>
              </div>
              <div className="px-2.5 py-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-zinc-900 group-hover:text-blue-600">{v.code}</span>
                  <DiscBadge todayYmd={todayYmd} expiry={v.registration_disc_expiry_date} />
                </div>
                <div className="text-xs text-zinc-500 truncate">
                  {[v.make, v.model].filter(Boolean).join(" ") || assetClassLabel(v.asset_class)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                <th className="pb-3 pr-4 w-12"></th>
                <th className="pb-3 pr-4">Code</th>
                <th className="pb-3 pr-4">Vehicle</th>
                <th className="pb-3 pr-4 hidden sm:table-cell">License</th>
                <th className="pb-3 pr-4 hidden md:table-cell">Category</th>
                <th className="pb-3 pr-4">Location</th>
                <th className="pb-3 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v, idx) => (
                <tr key={v.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                  <td className="py-2 pr-3">
                    <div className="h-10 w-10 rounded-md overflow-hidden bg-zinc-100 border border-zinc-200">
                      {v.photo_url ? (
                        <img src={v.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[10px] text-zinc-400">—</div>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/vehicles/${v.id}`}
                        className="font-bold text-blue-600 hover:underline text-base"
                        data-tutorial={idx === 0 ? "tutorial-vehicles-first-link" : undefined}
                      >
                        {v.code}
                      </Link>
                      <DiscBadge todayYmd={todayYmd} expiry={v.registration_disc_expiry_date} />
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{v.make} {v.model}</div>
                    {v.year && <div className="text-xs text-zinc-400">{v.year}</div>}
                  </td>
                  <td className="py-3 pr-4 hidden sm:table-cell text-zinc-600">{v.license_plate || "—"}</td>
                  <td className="py-3 pr-4 hidden md:table-cell text-zinc-600">{assetClassLabel(v.asset_class)}</td>
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

function DiscBadge({
  todayYmd,
  expiry,
}: {
  todayYmd: string;
  expiry?: string | null;
}): React.ReactElement | null {
  const exp = (expiry || "").trim().slice(0, 10);
  if (!exp) return null;
  const tier = registrationDiscDashboardTier(todayYmd, exp);
  if (!tier) return null;
  if (tier === "expired" || tier === "within_30") {
    return (
      <Badge variant="destructive" className="text-[10px] font-semibold">
        Disc {tier === "expired" ? "expired" : "≤30d"}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] font-semibold bg-amber-100 text-amber-900">
      Disc ≤60d
    </Badge>
  );
}

function AddVehicleForm({
  organizationId,
  onAdded,
  onCancel,
}: {
  organizationId: string;
  onAdded: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      organizationId,
      code: fd.get("code"),
      make: fd.get("make"),
      model: fd.get("model"),
      year: fd.get("year") ? Number(fd.get("year")) : null,
      licensePlate: fd.get("licensePlate"),
      assetClass: fd.get("assetClass"),
      transmission: fd.get("transmission") || "",
      homeLocation: fd.get("homeLocation"),
      status: fd.get("status"),
    };

    const res = await fetch("/api/vehicles", {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
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
          <Select name="assetClass" label="Category" defaultValue={ASSET_CLASS.FOUR_WD}>
            {(Object.values(ASSET_CLASS) as AssetClass[]).map((c) => (
              <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>
            ))}
          </Select>
          <Select name="transmission" label="Transmission" defaultValue="">
            <option value="">Not recorded</option>
            <option value="automatic">Automatic</option>
            <option value="manual">Manual</option>
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
