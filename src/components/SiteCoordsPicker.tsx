"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getDefaultMapViewForOrganization } from "@/lib/org-map-view";

interface SiteCoordsPickerProps {
  organizationId: string;
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  height?: number;
}

/**
 * Small map: click or drag marker to set destination GPS for reference sites (routing).
 */
export function SiteCoordsPicker({
  organizationId,
  lat,
  lng,
  onChange,
  height = 220,
}: SiteCoordsPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const view = getDefaultMapViewForOrganization(organizationId);
    const map = L.map(el).setView(Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : view.center, view.zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLatLng();
      onChange(p.lat, p.lng);
    });
    map.on("click", (e) => {
      marker.setLatLng(e.latlng);
      onChange(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Remount when org or anchor position changes (parent uses key=… for new site row).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: one init per mount
  }, [organizationId]);

  useEffect(() => {
    const m = markerRef.current;
    const map = mapRef.current;
    if (!m || !map) return;
    m.setLatLng([lat, lng]);
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg border border-slate-200 overflow-hidden z-0"
      style={{ height }}
    />
  );
}
