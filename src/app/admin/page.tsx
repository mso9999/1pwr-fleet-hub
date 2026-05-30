"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VehicleCheckApproversAdmin } from "@/components/VehicleCheckApproversAdmin";
import { PvrRatesAdmin } from "@/components/PvrRatesAdmin";
import { SiteCoordsPicker } from "@/components/SiteCoordsPicker";
import { getDefaultMapViewForOrganization } from "@/lib/org-map-view";
import { bearerAuthHeaders, jsonHeadersWithBearer } from "@/lib/client-bearer";
import { canManageFleetMechanics } from "@/lib/fleet-roles";

interface RefItem {
  id: string;
  organization_id: string;
  type: string;
  code: string;
  label: string;
  sort_order: number;
  active: number;
  meta?: string | null;
}

interface OrgRow {
  id: string;
  name: string;
  code: string;
  country: string;
  route_origin_lat: number | null;
  route_origin_lng: number | null;
}

function parseSiteMeta(meta: string | null | undefined): { lat: number; lng: number } | null {
  if (!meta?.trim()) return null;
  try {
    const o = JSON.parse(meta) as {
      lat?: unknown;
      lng?: unknown;
      latitude?: unknown;
      longitude?: unknown;
    };
    const latRaw = o.lat ?? o.latitude;
    const lngRaw = o.lng ?? o.longitude;
    const lat = typeof latRaw === "number" ? latRaw : Number(latRaw);
    const lng = typeof lngRaw === "number" ? lngRaw : Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function mergeSiteMeta(meta: string | null | undefined, lat: number, lng: number): string {
  let o: Record<string, unknown> = {};
  try {
    if (meta?.trim()) o = JSON.parse(meta) as Record<string, unknown>;
  } catch {
    o = {};
  }
  o.lat = lat;
  o.lng = lng;
  o.latitude = lat;
  o.longitude = lng;
  return JSON.stringify(o);
}

const REF_TYPES = [
  { value: "site", label: "Sites / Destinations (PR)" },
  { value: "department", label: "Departments (PR)" },
  { value: "mission_type", label: "Mission Types" },
  { value: "third_party_shop", label: "3rd Party Shops" },
];

export default function AdminPage() {
  const { organizationId, user } = useAuth();
  const canEditPvrRates = user?.role === "finance" || user?.role === "superadmin";
  const canEditRouteOrigin =
    user &&
    ["fleet_lead", "manager", "admin", "finance", "superadmin"].includes(user.role);
  const canManageMechanicsRegister =
    user && canManageFleetMechanics(user.role, user.department);
  const [items, setItems] = useState<RefItem[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [selectedType, setSelectedType] = useState("site");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSort, setNewSort] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingPr, setIsSyncingPr] = useState(false);
  const [isSyncingUgp, setIsSyncingUgp] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [gpsEditingId, setGpsEditingId] = useState<string | null>(null);
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLng, setGpsLng] = useState("");
  const [routeOriginLat, setRouteOriginLat] = useState("");
  const [routeOriginLng, setRouteOriginLng] = useState("");
  const [routeOriginSaving, setRouteOriginSaving] = useState(false);

  useEffect(() => {
    fetch("/api/organizations").then((r) => r.json()).then(setOrgs).catch(() => {});
  }, []);

  useEffect(() => {
    loadItems();
  }, [organizationId, selectedType]);

  function loadItems(): void {
    setIsLoading(true);
    fetch(`/api/reference-data?org=${organizationId}&type=${selectedType}`)
      .then((r) => r.json())
      .then((data) => { setItems(data); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }

  async function handleAdd(): Promise<void> {
    if (!newCode.trim() || !newLabel.trim()) return;
    await fetch("/api/reference-data", {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({
        organization_id: organizationId,
        type: selectedType,
        code: newCode.trim().toUpperCase().replace(/\s+/g, "_"),
        label: newLabel.trim(),
        sort_order: newSort,
      }),
    });
    setNewCode("");
    setNewLabel("");
    setNewSort(0);
    loadItems();
  }

  async function handleUpdate(id: string): Promise<void> {
    await fetch(`/api/reference-data/${id}`, {
      method: "PATCH",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ label: editLabel, sort_order: editSort }),
    });
    setEditingId(null);
    loadItems();
  }

  async function handleToggleActive(item: RefItem): Promise<void> {
    await fetch(`/api/reference-data/${item.id}`, {
      method: "PATCH",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ active: item.active ? 0 : 1 }),
    });
    loadItems();
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm("Delete this item permanently?")) return;
    await fetch(`/api/reference-data/${id}`, {
      method: "DELETE",
      headers: await bearerAuthHeaders(),
    });
    loadItems();
  }

  async function syncFromPr(): Promise<void> {
    setIsSyncingPr(true);
    setSyncMessage(null);
    try {
      const res = await fetch(`/api/sync/pr-reference?org=${organizationId}`, {
        method: "POST",
        headers: await bearerAuthHeaders(),
      });
      const data = (await res.json()) as {
        success?: boolean;
        sites?: { upserted: number; deactivated: number };
        departments?: { upserted: number; deactivated: number };
        error?: string;
      };
      if (data.success) {
        setSyncMessage(
          `PR sync OK — sites: +${data.sites?.upserted ?? 0} / −${data.sites?.deactivated ?? 0}; departments: +${data.departments?.upserted ?? 0} / −${data.departments?.deactivated ?? 0}`
        );
        loadItems();
      } else {
        setSyncMessage(data.error || "Sync failed");
      }
    } catch {
      setSyncMessage("Sync request failed");
    } finally {
      setIsSyncingPr(false);
    }
  }

  async function syncFromUgp(): Promise<void> {
    setIsSyncingUgp(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/sync/ugp-sites", {
        method: "POST",
        headers: await bearerAuthHeaders(),
      });
      const data = (await res.json()) as {
        success?: boolean;
        upserted?: number;
        created?: number;
        updated?: number;
        withCoords?: number;
        missingCoords?: number;
        error?: string;
      };
      if (data.success) {
        setSyncMessage(
          `UGP site sync OK — upserted: ${data.upserted ?? 0} (new ${data.created ?? 0}, updated ${data.updated ?? 0}), with GPS: ${data.withCoords ?? 0}, missing GPS: ${data.missingCoords ?? 0}`
        );
        loadItems();
      } else {
        setSyncMessage(data.error || "UGP sync failed");
      }
    } catch {
      setSyncMessage("UGP sync request failed");
    } finally {
      setIsSyncingUgp(false);
    }
  }

  const currentOrg = orgs.find((o) => o.id === organizationId);

  useEffect(() => {
    if (!currentOrg) return;
    const lat = currentOrg.route_origin_lat;
    const lng = currentOrg.route_origin_lng;
    const def = getDefaultMapViewForOrganization(organizationId);
    setRouteOriginLat(
      typeof lat === "number" && Number.isFinite(lat) ? String(lat) : String(def.center[0])
    );
    setRouteOriginLng(
      typeof lng === "number" && Number.isFinite(lng) ? String(lng) : String(def.center[1])
    );
  }, [currentOrg, organizationId]);

  function openSiteGps(item: RefItem): void {
    const parsed = parseSiteMeta(item.meta);
    const def = getDefaultMapViewForOrganization(organizationId);
    setGpsLat(String(parsed?.lat ?? def.center[0]));
    setGpsLng(String(parsed?.lng ?? def.center[1]));
    setGpsEditingId(item.id);
  }

  async function handleSaveSiteGps(item: RefItem): Promise<void> {
    const lat = parseFloat(gpsLat);
    const lng = parseFloat(gpsLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    await fetch(`/api/reference-data/${item.id}`, {
      method: "PATCH",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ meta: mergeSiteMeta(item.meta ?? null, lat, lng) }),
    });
    setGpsEditingId(null);
    loadItems();
  }

  async function handleSaveRouteOrigin(): Promise<void> {
    if (!currentOrg || !canEditRouteOrigin) return;
    const lat = parseFloat(routeOriginLat);
    const lng = parseFloat(routeOriginLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setRouteOriginSaving(true);
    try {
      const res = await fetch(`/api/organizations/${currentOrg.id}`, {
        method: "PATCH",
        headers: await jsonHeadersWithBearer(),
        body: JSON.stringify({ routeOriginLat: lat, routeOriginLng: lng }),
      });
      if (res.ok) {
        const refreshed = await fetch("/api/organizations").then((r) => r.json());
        setOrgs(refreshed);
      }
    } finally {
      setRouteOriginSaving(false);
    }
  }

  const gpsLatNum = parseFloat(gpsLat);
  const gpsLngNum = parseFloat(gpsLng);
  const routeOriginLatNum = parseFloat(routeOriginLat);
  const routeOriginLngNum = parseFloat(routeOriginLng);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin — Reference Data</h1>
          <p className="text-slate-500">
            Manage dropdown options for{" "}
            <span className="font-semibold text-slate-700">{currentOrg?.name || organizationId}</span>
            . Sites and departments are mirrored from the PR app Firestore (
            <code className="text-xs text-slate-600">referenceData_sites</code>,{" "}
            <code className="text-xs text-slate-600">referenceData_departments</code>
            ).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled={isSyncingPr} onClick={() => void syncFromPr()}>
            {isSyncingPr ? "Syncing from PR…" : "Sync sites & departments from PR"}
          </Button>
          <Button type="button" variant="outline" disabled={isSyncingUgp} onClick={() => void syncFromUgp()}>
            {isSyncingUgp ? "Syncing from UGP…" : "Seed site GPS from UGP"}
          </Button>
        </div>
      </div>
      {syncMessage && (
        <p className={`text-sm ${/failed|Sync request/i.test(syncMessage) ? "text-red-600" : "text-emerald-700"}`}>
          {syncMessage}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fleet mechanics</CardTitle>
          <p className="text-sm text-slate-500 font-normal mt-1">
            Curated roster behind the Work Order <em>Assign to</em> and Labour pickers.
            Every change is recorded with the actor and a before/after snapshot — visible
            per-record on that page.
            {canManageMechanicsRegister
              ? " Edit access: admin, fleet management, and PR departments DPO / HR / IT / Fleet."
              : " Read-only for your role — editing is limited to admin, fleet management, and PR departments DPO / HR / IT / Fleet."}
          </p>
        </CardHeader>
        <CardContent>
          <Link
            href="/admin/fleet-mechanics"
            className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Open Fleet mechanics
          </Link>
        </CardContent>
      </Card>

      {canEditRouteOrigin && currentOrg && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trip route start (fleet HQ)</CardTitle>
            <p className="text-sm text-slate-500 font-normal mt-1">
              Driving distance for vehicle requests is calculated from this point to each site’s GPS. Set coordinates below
              or rely on the HQ site marker / defaults.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <Input
                label="Latitude"
                type="text"
                value={routeOriginLat}
                onChange={(e) => setRouteOriginLat(e.target.value)}
                className="w-40"
              />
              <Input
                label="Longitude"
                type="text"
                value={routeOriginLng}
                onChange={(e) => setRouteOriginLng(e.target.value)}
                className="w-40"
              />
              <Button
                type="button"
                onClick={() => void handleSaveRouteOrigin()}
                disabled={
                  routeOriginSaving ||
                  !Number.isFinite(routeOriginLatNum) ||
                  !Number.isFinite(routeOriginLngNum)
                }
              >
                {routeOriginSaving ? "Saving…" : "Save HQ GPS"}
              </Button>
            </div>
            {Number.isFinite(routeOriginLatNum) && Number.isFinite(routeOriginLngNum) && (
              <SiteCoordsPicker
                key={`hq-${organizationId}`}
                organizationId={organizationId}
                lat={routeOriginLatNum}
                lng={routeOriginLngNum}
                onChange={(la, ln) => {
                  setRouteOriginLat(String(la));
                  setRouteOriginLng(String(ln));
                }}
              />
            )}
          </CardContent>
        </Card>
      )}

      <VehicleCheckApproversAdmin organizationId={organizationId} />

      {canEditPvrRates && <PvrRatesAdmin organizationId={organizationId} />}

      {/* Type selector */}
      <div className="flex gap-2 flex-wrap">
        {REF_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setSelectedType(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedType === t.value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Add new item */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add New {REF_TYPES.find((t) => t.value === selectedType)?.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end flex-wrap">
            <Input label="Code" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-32" placeholder="e.g. MAF" />
            <Input label="Display Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="w-64" placeholder="e.g. Mafeteng" />
            <Input label="Sort Order" type="number" value={newSort} onChange={(e) => setNewSort(Number(e.target.value))} className="w-24" />
            <Button onClick={handleAdd}>Add</Button>
          </div>
        </CardContent>
      </Card>

      {/* Items list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {REF_TYPES.find((t) => t.value === selectedType)?.label} ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-400 py-4">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-slate-400 py-4">No items yet. Add one above.</p>
          ) : (
            <div className="divide-y">
              {items.map((item) => {
                const siteGps = selectedType === "site" ? parseSiteMeta(item.meta) : null;
                return (
                  <div key={item.id} className="py-3 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span
                        className={`font-mono text-xs px-2 py-1 rounded ${item.active ? "bg-slate-100" : "bg-red-50 text-red-400 line-through"}`}
                      >
                        {item.code}
                      </span>
                      {selectedType === "site" && (
                        <span
                          className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                            siteGps ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {siteGps ? "GPS set" : "GPS missing"}
                        </span>
                      )}

                      {editingId === item.id ? (
                        <>
                          <input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="flex-1 min-w-[120px] px-2 py-1 border rounded text-sm"
                            autoFocus
                          />
                          <input
                            type="number"
                            value={editSort}
                            onChange={(e) => setEditSort(Number(e.target.value))}
                            className="w-16 px-2 py-1 border rounded text-sm"
                          />
                          <Button size="sm" onClick={() => handleUpdate(item.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className={`flex-1 text-sm min-w-[120px] ${!item.active ? "text-slate-400 line-through" : ""}`}>
                            {item.label}
                          </span>
                          <span className="text-xs text-slate-400 w-8 text-center">{item.sort_order}</span>
                          {selectedType === "site" && (
                            <Button
                              size="sm"
                              variant={gpsEditingId === item.id ? "default" : "outline"}
                              onClick={() =>
                                gpsEditingId === item.id ? setGpsEditingId(null) : openSiteGps(item)
                              }
                            >
                              {gpsEditingId === item.id ? "Close map" : "Set GPS"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(item.id);
                              setEditLabel(item.label);
                              setEditSort(item.sort_order);
                            }}
                          >
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleToggleActive(item)}>
                            {item.active ? "Disable" : "Enable"}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(item.id)}>
                            ✕
                          </Button>
                        </>
                      )}
                    </div>

                    {selectedType === "site" && gpsEditingId === item.id && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-3">
                        <p className="text-xs text-slate-600">
                          Click the map or drag the pin to set this site’s coordinates. Used for driving distance to this
                          destination.
                        </p>
                        <div className="flex flex-wrap gap-2 items-end">
                          <Input
                            label="Latitude"
                            type="text"
                            value={gpsLat}
                            onChange={(e) => setGpsLat(e.target.value)}
                            className="w-36"
                          />
                          <Input
                            label="Longitude"
                            type="text"
                            value={gpsLng}
                            onChange={(e) => setGpsLng(e.target.value)}
                            className="w-36"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleSaveSiteGps(item)}
                            disabled={!Number.isFinite(gpsLatNum) || !Number.isFinite(gpsLngNum)}
                          >
                            Save site GPS
                          </Button>
                        </div>
                        {Number.isFinite(gpsLatNum) && Number.isFinite(gpsLngNum) && (
                          <SiteCoordsPicker
                            key={item.id}
                            organizationId={organizationId}
                            lat={gpsLatNum}
                            lng={gpsLngNum}
                            onChange={(la, ln) => {
                              setGpsLat(String(la));
                              setGpsLng(String(ln));
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
