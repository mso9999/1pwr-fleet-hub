"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MissionRouteMap, type RoutePreviewPoint } from "@/components/MissionRouteMap";

export type RouteSite = { code: string; label: string; meta?: string };

export type RoutePin = {
  siteCode: string;
  label: string;
  lat: number | null;
  lng: number | null;
};

export type RouteWaypoint = RoutePin & {
  loadOut: string;
  loadIn: string;
  notes: string;
};

export type MissionRouteValue = {
  roundTrip: boolean;
  origin: RoutePin;
  destination: RoutePin;
  waypoints: RouteWaypoint[];
};

function coordsFromMeta(meta: string | undefined): { lat: number; lng: number } | null {
  if (!meta || !meta.trim()) return null;
  try {
    const o = JSON.parse(meta) as { lat?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown };
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number(o.lng ?? o.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function pinLabel(pin: RoutePin): string {
  if (pin.siteCode && pin.label && pin.label !== pin.siteCode) return `${pin.siteCode} — ${pin.label}`;
  return pin.siteCode || pin.label || "Not set";
}

function emptyPin(): RoutePin {
  return { siteCode: "", label: "", lat: null, lng: null };
}

export function MissionRouteEditor({
  organizationId,
  sites,
  value,
  onChange,
}: {
  organizationId: string;
  sites: RouteSite[];
  value: MissionRouteValue;
  onChange: (next: MissionRouteValue) => void;
}): React.ReactElement {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<"origin" | "destination" | number>("destination");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites.slice(0, 8);
    return sites
      .filter((s) => s.code.toLowerCase().includes(q) || s.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, sites]);

  function applySite(site: RouteSite): void {
    const coords = coordsFromMeta(site.meta);
    const pin: RoutePin = {
      siteCode: site.code,
      label: site.label,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    };
    if (active === "origin") {
      onChange({ ...value, origin: pin });
    } else if (active === "destination") {
      onChange({ ...value, destination: pin });
    } else {
      const waypoints = value.waypoints.slice();
      const prev = waypoints[active];
      waypoints[active] = {
        ...pin,
        loadOut: prev?.loadOut || "",
        loadIn: prev?.loadIn || "",
        notes: prev?.notes || "",
      };
      onChange({ ...value, waypoints });
    }
    setQuery("");
  }

  function applyPin(lat: number, lng: number): void {
    const pin: RoutePin = {
      siteCode: "",
      label: `Pin ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      lat,
      lng,
    };
    const originSet = !!(value.origin.siteCode || value.origin.lat != null);
    const destSet = !!(value.destination.siteCode || value.destination.lat != null);
    if (!originSet) {
      onChange({ ...value, origin: pin });
      setActive("destination");
      return;
    }
    if (!destSet) {
      onChange({ ...value, destination: pin });
      return;
    }
    onChange({
      ...value,
      waypoints: [
        ...value.waypoints,
        { ...pin, loadOut: "", loadIn: "", notes: "" },
      ],
    });
  }

  const previewPoints: RoutePreviewPoint[] = [
    {
      label: value.origin.siteCode || value.origin.label || "HQ",
      siteCode: value.origin.siteCode || value.origin.label || "HQ",
      lat: value.origin.lat,
      lng: value.origin.lng,
    },
    ...value.waypoints
      .filter((w) => w.siteCode || w.label || w.lat != null)
      .map((w) => ({
        label: w.siteCode || w.label,
        siteCode: w.siteCode || w.label,
        lat: w.lat,
        lng: w.lng,
      })),
    ...(value.destination.siteCode || value.destination.label || value.destination.lat != null
      ? [
          {
            label: value.destination.siteCode || value.destination.label,
            siteCode: value.destination.siteCode || value.destination.label,
            lat: value.destination.lat,
            lng: value.destination.lng,
          },
        ]
      : []),
  ];

  const tripShape = value.roundTrip
    ? "round_trip"
    : value.waypoints.some((w) => w.siteCode || w.label || w.lat != null)
      ? "multi_stop"
      : "one_way";

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
      <label className="flex items-center gap-2 text-sm text-zinc-800">
        <input
          type="checkbox"
          checked={value.roundTrip}
          onChange={(e) => onChange({ ...value, roundTrip: e.target.checked })}
          className="h-4 w-4"
        />
        Round trip — the route returns to the origin
      </label>
      <p className="text-[11px] text-zinc-500">
        Search a site, or click the map to drop a pin. Stops sit between the origin and the destination.
      </p>
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,280px)_1fr]">
        <div className="space-y-2">
          <Input
            label={active === "origin" ? "Search origin" : active === "destination" ? "Search destination" : "Search stop"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Site code or name"
          />
          {query.trim() && (
            <ul className="max-h-40 overflow-auto rounded-lg border border-zinc-200 bg-white text-sm">
              {matches.length === 0 ? (
                <li className="px-2 py-1.5 text-zinc-500">No site matches. Click the map to drop a pin.</li>
              ) : (
                matches.map((s) => (
                  <li key={s.code}>
                    <button
                      type="button"
                      className="w-full px-2 py-1.5 text-left hover:bg-zinc-50"
                      onClick={() => applySite(s)}
                    >
                      <span className="font-medium">{s.code}</span>
                      <span className="text-zinc-600"> — {s.label}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setActive("origin")}
            className={`w-full rounded-lg border px-2 py-1.5 text-left text-sm ${active === "origin" ? "border-blue-500 bg-blue-50" : "border-zinc-200"}`}
          >
            <span className="text-[10px] uppercase text-zinc-500">Origin</span>
            <span className="block">{pinLabel(value.origin)}</span>
          </button>
          {value.waypoints.map((w, idx) => (
            <div key={idx} className="space-y-1 rounded-lg border border-zinc-200 p-2">
              <button
                type="button"
                onClick={() => setActive(idx)}
                className={`w-full text-left text-sm ${active === idx ? "text-blue-800" : ""}`}
              >
                <span className="text-[10px] uppercase text-zinc-500">Stop {idx + 1}</span>
                <span className="block">{pinLabel(w)}</span>
              </button>
              <Input label="Load out" value={w.loadOut} onChange={(e) => {
                const waypoints = value.waypoints.slice();
                waypoints[idx] = { ...w, loadOut: e.target.value };
                onChange({ ...value, waypoints });
              }} />
              <Input label="Load in" value={w.loadIn} onChange={(e) => {
                const waypoints = value.waypoints.slice();
                waypoints[idx] = { ...w, loadIn: e.target.value };
                onChange({ ...value, waypoints });
              }} />
              <Input label="Stop notes" value={w.notes} onChange={(e) => {
                const waypoints = value.waypoints.slice();
                waypoints[idx] = { ...w, notes: e.target.value };
                onChange({ ...value, waypoints });
              }} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ ...value, waypoints: value.waypoints.filter((_, i) => i !== idx) })}
              >
                Remove stop
              </Button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setActive("destination")}
            className={`w-full rounded-lg border px-2 py-1.5 text-left text-sm ${active === "destination" ? "border-blue-500 bg-blue-50" : "border-zinc-200"}`}
          >
            <span className="text-[10px] uppercase text-zinc-500">Destination</span>
            <span className="block">{value.destination.siteCode || value.destination.label ? pinLabel(value.destination) : "Not set"}</span>
          </button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onChange({
                ...value,
                waypoints: [...value.waypoints, { ...emptyPin(), loadOut: "", loadIn: "", notes: "" }],
              });
              setActive(value.waypoints.length);
            }}
          >
            + Add stop
          </Button>
        </div>
        <MissionRouteMap
          organizationId={organizationId}
          tripShape={tripShape}
          points={previewPoints}
          height={320}
          onMapClick={applyPin}
        />
      </div>
    </div>
  );
}
