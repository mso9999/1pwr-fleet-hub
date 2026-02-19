"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface VehicleLocation {
  id: string;
  code: string;
  make: string;
  model: string;
  licensePlate: string;
  currentLocation: string;
  status: string;
  trackerImei: string;
  trackerStatus: string;
  trackerProvider: string;
  lat: number;
  lng: number;
}

interface SiteCoords {
  [key: string]: { lat: number; lng: number };
}

const STATUS_COLORS: Record<string, string> = {
  operational: "#22c55e",
  deployed: "#3b82f6",
  "maintenance-hq": "#f59e0b",
  "maintenance-3rd": "#f97316",
  "awaiting-parts": "#a855f7",
  grounded: "#ef4444",
  "written-off": "#6b7280",
};

function getMarkerSvg(status: string, hasTracker: boolean): string {
  const color = STATUS_COLORS[status] || "#6b7280";
  const ring = hasTracker ? `<circle cx="12" cy="12" r="11" fill="none" stroke="#10b981" stroke-width="2"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
    ${ring}
    <text x="12" y="16" text-anchor="middle" font-size="9" font-weight="bold" fill="white" font-family="Arial">●</text>
  </svg>`;
}

function createVehicleIcon(status: string, hasTracker: boolean): L.DivIcon {
  return L.divIcon({
    html: getMarkerSvg(status, hasTracker),
    className: "fleet-marker",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

interface FleetMapProps {
  onVehicleClick?: (id: string) => void;
}

export default function FleetMap({ onVehicleClick }: FleetMapProps): React.ReactElement {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const [vehicles, setVehicles] = useState<VehicleLocation[]>([]);
  const [sites, setSites] = useState<SiteCoords>({});
  const [filter, setFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/vehicles/locations")
      .then((r) => r.json())
      .then((data) => {
        setVehicles(data.vehicles);
        setSites(data.sites);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!mapRef.current || isLoading) return;

    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current, {
        center: [-29.31, 27.48],
        zoom: 8,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(leafletMap.current);
    }

    const map = leafletMap.current;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    // Add site labels
    Object.entries(sites).forEach(([code, coords]) => {
      if (code === "OTHER") return;
      L.marker([coords.lat, coords.lng], {
        icon: L.divIcon({
          html: `<div style="background:rgba(30,41,59,0.75);color:white;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap;">${code}</div>`,
          className: "site-label",
          iconSize: [60, 20],
          iconAnchor: [30, 10],
        }),
        interactive: false,
      }).addTo(map);
    });

    // Filter vehicles
    const filtered = filter === "all"
      ? vehicles
      : filter === "tracked"
        ? vehicles.filter((v) => v.trackerImei && v.trackerStatus === "active")
        : vehicles.filter((v) => v.status === filter);

    // Add vehicle markers
    filtered.forEach((v) => {
      const hasTracker = !!(v.trackerImei && v.trackerStatus === "active");
      const marker = L.marker([v.lat, v.lng], {
        icon: createVehicleIcon(v.status, hasTracker),
      }).addTo(map);

      const trackerBadge = hasTracker
        ? `<span style="background:#10b981;color:white;padding:1px 6px;border-radius:9px;font-size:10px;">GPS</span>`
        : `<span style="background:#6b7280;color:white;padding:1px 6px;border-radius:9px;font-size:10px;">No GPS</span>`;

      marker.bindPopup(`
        <div style="min-width:180px;font-family:system-ui;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${v.code}</div>
          <div style="color:#64748b;font-size:12px;margin-bottom:6px;">${v.make} ${v.model}</div>
          <div style="font-size:12px;margin-bottom:2px;"><b>Plate:</b> ${v.licensePlate || "—"}</div>
          <div style="font-size:12px;margin-bottom:2px;"><b>Location:</b> ${v.currentLocation}</div>
          <div style="font-size:12px;margin-bottom:2px;"><b>Status:</b> ${v.status}</div>
          <div style="font-size:12px;margin-bottom:4px;">${trackerBadge}</div>
          ${v.trackerImei ? `<div style="font-size:11px;color:#94a3b8;">IMEI: ${v.trackerImei}</div>` : ""}
        </div>
      `);

      marker.on("click", () => {
        if (onVehicleClick) onVehicleClick(v.id);
      });
    });

    // Fit bounds if vehicles exist
    if (filtered.length > 0) {
      const bounds = L.latLngBounds(filtered.map((v) => [v.lat, v.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }

    return () => {};
  }, [vehicles, sites, filter, isLoading, onVehicleClick]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  const statusCounts = vehicles.reduce((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const trackedCount = vehicles.filter((v) => v.trackerImei && v.trackerStatus === "active").length;

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            filter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          All ({vehicles.length})
        </button>
        <button
          onClick={() => setFilter("tracked")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            filter === "tracked" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          GPS Tracked ({trackedCount})
        </button>
        {Object.entries(statusCounts).map(([status, count]) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === status ? "text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
            style={filter === status ? { backgroundColor: STATUS_COLORS[status] || "#6b7280" } : { backgroundColor: "#f1f5f9" }}
          >
            {status.replace(/-/g, " ")} ({count})
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-slate-500">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            {status.replace(/-/g, " ")}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-emerald-500 bg-transparent" />
          GPS tracked
        </span>
      </div>

      {/* Map */}
      <div ref={mapRef} className="flex-1 rounded-xl border border-slate-200 shadow-sm" style={{ minHeight: 500 }} />
    </div>
  );
}
