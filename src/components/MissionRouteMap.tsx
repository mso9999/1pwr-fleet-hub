"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fixLeafletDefaultIcons } from "@/lib/leaflet-default-icons";
import { getDefaultMapViewForOrganization } from "@/lib/org-map-view";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";

fixLeafletDefaultIcons(L);

export type RoutePreviewPoint = {
  label: string;
  siteCode?: string;
  lat?: number | null;
  lng?: number | null;
};

type PreviewResponse = {
  ok?: boolean;
  totalKm?: number | null;
  geometry?: Array<[number, number]>;
  places?: Array<{ label: string; lat: number | null; lng: number | null; resolved: boolean }>;
  unresolved?: string[];
  message?: string | null;
};

export function MissionRouteMap({
  organizationId,
  tripShape,
  points,
  height = 240,
  onMapClick,
}: {
  organizationId: string;
  tripShape: string;
  points: RoutePreviewPoint[];
  height?: number;
  onMapClick?: (lat: number, lng: number) => void;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const pointKey = JSON.stringify({ organizationId, tripShape, points });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const view = getDefaultMapViewForOrganization(organizationId);
    const map = L.map(el).setView(view.center, view.zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    const layers = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      clickRef.current?.(e.latlng.lat, e.latlng.lng);
    });
    mapRef.current = map;
    layerRef.current = layers;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    const usable = points.filter((p) => String(p.label || p.siteCode || "").trim() || (p.lat != null && p.lng != null));
    if (usable.length === 0) {
      setPreview(null);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const headers = await jsonHeadersWithBearer();
        const res = await fetch("/api/missions/route-preview", {
          method: "POST",
          headers,
          body: JSON.stringify({
            organizationId,
            tripShape,
            points: usable.map((p) => ({
              label: p.label,
              siteCode: p.siteCode || p.label,
              lat: p.lat ?? null,
              lng: p.lng ?? null,
            })),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as PreviewResponse;
        if (!cancelled) setPreview(res.ok ? data : { message: "Could not draw the route." });
      } catch {
        if (!cancelled) setPreview({ message: "Could not draw the route." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // pointKey already covers organization, shape, and points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointKey]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers) return;
    layers.clearLayers();
    const places = (preview?.places || []).filter((p) => p.resolved && p.lat != null && p.lng != null);
    const geometry = preview?.geometry || [];
    if (geometry.length >= 2) {
      L.polyline(geometry, { color: "#2563eb", weight: 4, opacity: 0.9 }).addTo(layers);
    } else if (places.length >= 2) {
      L.polyline(
        places.map((p) => [p.lat as number, p.lng as number]),
        { color: "#2563eb", weight: 3, dashArray: "6 6", opacity: 0.8 }
      ).addTo(layers);
    }
    places.forEach((p, i) => {
      const letter = String.fromCharCode(65 + Math.min(i, 25));
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#1d4ed8;color:#fff;border-radius:999px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)">${letter}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker([p.lat as number, p.lng as number], { icon })
        .bindTooltip(p.label || letter, { direction: "top" })
        .addTo(layers);
    });
    const bounds = L.latLngBounds([]);
    for (const pair of geometry) bounds.extend(pair);
    for (const p of places) bounds.extend([p.lat as number, p.lng as number]);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
    map.invalidateSize();
  }, [preview]);

  const unresolved = preview?.unresolved || [];

  return (
    <div className="space-y-1">
      <div ref={containerRef} style={{ height }} className="w-full overflow-hidden rounded-lg border border-zinc-200" />
      <p className="text-[11px] text-zinc-500">
        {loading
          ? "Drawing route…"
          : preview?.totalKm != null
            ? `Road distance about ${preview.totalKm} km.`
            : "Pick an origin and a destination to draw the route."}
        {unresolved.length > 0 ? ` No GPS for ${unresolved.join(", ")}.` : ""}
      </p>
    </div>
  );
}
