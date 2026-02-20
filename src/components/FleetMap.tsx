"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(0)} m`;
}

interface FleetMapProps {
  onVehicleClick?: (id: string) => void;
}

export default function FleetMap({ onVehicleClick }: FleetMapProps): React.ReactElement {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const siteLabelsLayerRef = useRef<L.LayerGroup | null>(null);
  const measureLayerRef = useRef<L.LayerGroup | null>(null);
  const tooltipLayerRef = useRef<L.LayerGroup | null>(null);
  const [vehicles, setVehicles] = useState<VehicleLocation[]>([]);
  const [sites, setSites] = useState<SiteCoords>({});
  const [filter, setFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [measureMode, setMeasureMode] = useState(false);
  const measurePointsRef = useRef<Array<{ lat: number; lng: number }>>([]);
  const measureModeRef = useRef(false);

  useEffect(() => {
    measureModeRef.current = measureMode;
  }, [measureMode]);

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

  const handleMeasureClick = useCallback((e: L.LeafletMouseEvent) => {
    if (!measureModeRef.current || !measureLayerRef.current) return;

    const { lat, lng } = e.latlng;
    const points = measurePointsRef.current;

    if (points.length >= 2) {
      measureLayerRef.current.clearLayers();
      measurePointsRef.current = [];
    }

    points.push({ lat, lng });
    measurePointsRef.current = [...points];

    const layer = measureLayerRef.current;

    L.circleMarker([lat, lng], {
      radius: 6,
      fillColor: "#FF00FF",
      fillOpacity: 0.9,
      color: "#FFFFFF",
      weight: 2,
    }).addTo(layer);

    if (points.length === 2) {
      const [p1, p2] = points;
      L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], {
        color: "#FF00FF",
        weight: 3,
        dashArray: "10, 5",
      }).addTo(layer);

      const dist = haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      const midLat = (p1.lat + p2.lat) / 2;
      const midLng = (p1.lng + p2.lng) / 2;
      L.marker([midLat, midLng], {
        icon: L.divIcon({
          html: `<div style="background:rgba(255,0,255,0.9);color:white;padding:4px 8px;border-radius:4px;font-weight:bold;white-space:nowrap;font-size:13px;">${formatDistance(dist)}</div>`,
          className: "measure-label",
          iconSize: [100, 30],
          iconAnchor: [50, 15],
        }),
        interactive: false,
      }).addTo(layer);
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current || isLoading) return;

    if (!leafletMap.current) {
      const map = L.map(mapRef.current, {
        center: [-29.5, 27.8],
        zoom: 8,
        zoomControl: true,
      });

      const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 22,
        maxNativeZoom: 18,
      });

      const satelliteLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles &copy; Esri",
          maxZoom: 22,
          maxNativeZoom: 17,
        }
      );

      const topoLayer = L.tileLayer(
        "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        {
          attribution: "&copy; OpenTopoMap (CC-BY-SA)",
          maxZoom: 22,
          maxNativeZoom: 17,
        }
      );

      osmLayer.addTo(map);

      L.control.layers(
        { "Street Map": osmLayer, Satellite: satelliteLayer, Topographic: topoLayer },
        {},
        { position: "topright" }
      ).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      siteLabelsLayerRef.current = L.layerGroup().addTo(map);
      measureLayerRef.current = L.layerGroup().addTo(map);
      tooltipLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", handleMeasureClick);

      leafletMap.current = map;
    }

    const markers = markersLayerRef.current!;
    const siteLabels = siteLabelsLayerRef.current!;
    const tooltips = tooltipLayerRef.current!;
    markers.clearLayers();
    siteLabels.clearLayers();
    tooltips.clearLayers();

    const filtered =
      filter === "all"
        ? vehicles
        : filter === "tracked"
          ? vehicles.filter((v) => v.trackerImei && v.trackerStatus === "active")
          : vehicles.filter((v) => v.status === filter);

    filtered.forEach((v) => {
      const hasTracker = !!(v.trackerImei && v.trackerStatus === "active");
      const marker = L.marker([v.lat, v.lng], {
        icon: createVehicleIcon(v.status, hasTracker),
      }).addTo(markers);

      marker.bindTooltip(v.code, {
        direction: "top",
        offset: [0, -16],
        className: "fleet-tooltip",
        opacity: 0.95,
      });

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

    if (filtered.length > 0) {
      const bounds = L.latLngBounds(filtered.map((v) => [v.lat, v.lng] as [number, number]));
      leafletMap.current!.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [vehicles, sites, filter, isLoading, onVehicleClick, handleMeasureClick]);

  useEffect(() => {
    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  const toggleMeasure = useCallback(() => {
    setMeasureMode((prev) => {
      const next = !prev;
      if (!next && measureLayerRef.current) {
        measureLayerRef.current.clearLayers();
        measurePointsRef.current = [];
      }
      return next;
    });
  }, []);

  const statusCounts = vehicles.reduce((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const trackedCount = vehicles.filter((v) => v.trackerImei && v.trackerStatus === "active").length;

  return (
    <div className="flex flex-col h-full">
      <style jsx global>{`
        .fleet-tooltip {
          background: rgba(15, 23, 42, 0.9) !important;
          color: white !important;
          border: none !important;
          border-radius: 6px !important;
          padding: 3px 8px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
        }
        .fleet-tooltip::before {
          border-top-color: rgba(15, 23, 42, 0.9) !important;
        }
        .fleet-marker { background: none !important; border: none !important; }
        .site-label { background: none !important; border: none !important; }
        .measure-label { background: none !important; border: none !important; }
      `}</style>

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

        <div className="ml-auto">
          <button
            onClick={toggleMeasure}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              measureMode
                ? "bg-fuchsia-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 20l7-7m0 0l3-3m-3 3l-3-3m3 3l3 3M20 4l-7 7" />
            </svg>
            {measureMode ? "Measuring… (click 2 points)" : "Measure"}
          </button>
        </div>
      </div>

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

      <div ref={mapRef} className="flex-1 rounded-xl border border-slate-200 shadow-sm" style={{ minHeight: 500 }} />
    </div>
  );
}
