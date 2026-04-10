"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface HistoryTrailPoint {
  hoursAgo: number;
  lat: number | null;
  lng: number | null;
  sourceTs: number | null;
}

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
  /** Open trip / mission card when set (vehicle has an unchecked-out trip). */
  activeTripId: string | null;
  lat: number;
  lng: number;
  gpsLive: boolean;
  gpsTimestamp: number | null;
  gpsSpeed: number | null;
  gpsMileage: number | null;
  rewindHours: number;
  refTimeUnix: number;
  historyTrail: HistoryTrailPoint[];
  positionFromHistory?: boolean;
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

function getMarkerSvg(
  status: string,
  hasTracker: boolean,
  isLive: boolean,
  opts?: { fillOpacity?: number; scale?: number; hoursLabel?: number }
): string {
  const color = STATUS_COLORS[status] || "#6b7280";
  const fillOp = opts?.fillOpacity ?? 1;
  const label = opts?.hoursLabel != null ? `${opts.hoursLabel}h` : "●";
  const ring = isLive
    ? `<circle cx="12" cy="12" r="11" fill="none" stroke="#3b82f6" stroke-width="2.5"><animate attributeName="r" values="11;13;11" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite"/></circle>`
    : hasTracker && opts?.hoursLabel == null
      ? `<circle cx="12" cy="12" r="11" fill="none" stroke="#10b981" stroke-width="2"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="${color}" fill-opacity="${fillOp}" stroke="white" stroke-width="2"/>
    ${ring}
    <text x="12" y="16" text-anchor="middle" font-size="${opts?.hoursLabel != null ? "8" : "9"}" font-weight="bold" fill="white" font-family="system-ui,Arial">${label}</text>
  </svg>`;
}

function createVehicleIcon(
  status: string,
  hasTracker: boolean,
  isLive: boolean,
  opts?: { fillOpacity?: number; hoursLabel?: number }
): L.DivIcon {
  const w = opts?.hoursLabel != null ? 26 : 28;
  const anchor = w / 2;
  const svg = getMarkerSvg(status, hasTracker, isLive, opts);
  const wrap =
    opts?.hoursLabel != null
      ? `<div style="opacity:${0.4 + (6 - opts.hoursLabel) * 0.11};transform:scale(0.92);transform-origin:center bottom">${svg}</div>`
      : svg;
  return L.divIcon({
    html: wrap,
    className: "fleet-marker",
    iconSize: [w, w],
    iconAnchor: [anchor, anchor],
    popupAnchor: [0, -14],
  });
}

/** Oldest → newest: 5h, …, 1h, then current position (no label). */
function buildHistoryChain(v: VehicleLocation): Array<{ lat: number; lng: number; hoursLabel?: number }> {
  const trail = [...(v.historyTrail || [])].sort((a, b) => b.hoursAgo - a.hoursAgo);
  const chain: Array<{ lat: number; lng: number; hoursLabel?: number }> = [];
  for (const t of trail) {
    if (t.lat != null && t.lng != null) {
      chain.push({ lat: t.lat, lng: t.lng, hoursLabel: t.hoursAgo });
    }
  }
  chain.push({ lat: v.lat, lng: v.lng });
  return chain;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface FleetMapProps {
  onVehicleClick?: (id: string) => void;
  /** Mission / trip context: second arg is active trip id when deployed, else null. */
  onMissionClick?: (vehicleId: string, activeTripId: string | null) => void;
}

export default function FleetMap({ onVehicleClick, onMissionClick }: FleetMapProps): React.ReactElement {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const trailsLayerRef = useRef<L.LayerGroup | null>(null);
  const historyMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const siteLabelsLayerRef = useRef<L.LayerGroup | null>(null);
  const measureLayerRef = useRef<L.LayerGroup | null>(null);
  const tooltipLayerRef = useRef<L.LayerGroup | null>(null);
  const [vehicles, setVehicles] = useState<VehicleLocation[]>([]);
  const [sites, setSites] = useState<SiteCoords>({});
  const [filter, setFilter] = useState<string>("all");
  const [rewindHours, setRewindHours] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const skipFetchLoadingRef = useRef(false);
  const [measureMode, setMeasureMode] = useState(false);
  const measurePointsRef = useRef<Array<{ lat: number; lng: number }>>([]);
  const measureModeRef = useRef(false);
  const onVehicleClickRef = useRef(onVehicleClick);
  const onMissionClickRef = useRef(onMissionClick);
  onVehicleClickRef.current = onVehicleClick;
  onMissionClickRef.current = onMissionClick;

  useEffect(() => {
    measureModeRef.current = measureMode;
  }, [measureMode]);

  useEffect(() => {
    if (!skipFetchLoadingRef.current) {
      setIsLoading(true);
    }
    fetch(`/api/vehicles/locations?rewindHours=${rewindHours}`)
      .then((r) => r.json())
      .then((data) => {
        setVehicles(data.vehicles);
        setSites(data.sites);
        setIsLoading(false);
        skipFetchLoadingRef.current = true;
      })
      .catch(() => {
        setIsLoading(false);
        skipFetchLoadingRef.current = true;
      });
  }, [rewindHours]);

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

      trailsLayerRef.current = L.layerGroup().addTo(map);
      historyMarkersLayerRef.current = L.layerGroup().addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);
      siteLabelsLayerRef.current = L.layerGroup().addTo(map);
      measureLayerRef.current = L.layerGroup().addTo(map);
      tooltipLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", handleMeasureClick);

      leafletMap.current = map;
    }

    const trails = trailsLayerRef.current!;
    const historyMarkers = historyMarkersLayerRef.current!;
    const markers = markersLayerRef.current!;
    const siteLabels = siteLabelsLayerRef.current!;
    const tooltips = tooltipLayerRef.current!;
    trails.clearLayers();
    historyMarkers.clearLayers();
    markers.clearLayers();
    siteLabels.clearLayers();
    tooltips.clearLayers();

    const filtered =
      filter === "all"
        ? vehicles
        : filter === "live-gps"
          ? vehicles.filter((v) => v.gpsLive)
          : filter === "tracked"
            ? vehicles.filter((v) => v.trackerImei && v.trackerStatus === "active")
            : vehicles.filter((v) => v.status === filter);

    const boundsPoints: L.LatLngExpression[] = [];

    filtered.forEach((v) => {
      const hasTracker = !!(v.trackerImei && v.trackerStatus === "active");
      const baseColor = STATUS_COLORS[v.status] || "#6b7280";

      const chain = buildHistoryChain({ ...v, historyTrail: v.historyTrail ?? [] });
      if (chain.length >= 2) {
        const nSeg = chain.length - 1;
        for (let i = 0; i < nSeg; i++) {
          const opacity = 0.15 + 0.85 * ((i + 1) / nSeg);
          L.polyline(
            [
              [chain[i].lat, chain[i].lng],
              [chain[i + 1].lat, chain[i + 1].lng],
            ],
            {
              color: baseColor,
              opacity,
              weight: 4,
              lineCap: "round",
              lineJoin: "round",
            }
          ).addTo(trails);
        }
      }
      for (let i = 0; i < chain.length - 1; i++) {
        const p = chain[i];
        if (p.hoursLabel != null) {
          L.marker([p.lat, p.lng], {
            icon: createVehicleIcon(v.status, hasTracker, false, {
              hoursLabel: p.hoursLabel,
              fillOpacity: 0.35 + (6 - p.hoursLabel) * 0.1,
            }),
            interactive: false,
          }).addTo(historyMarkers);
          boundsPoints.push([p.lat, p.lng]);
        }
      }

      const isLiveMain = rewindHours === 0 && v.gpsLive;
      const marker = L.marker([v.lat, v.lng], {
        icon: createVehicleIcon(v.status, hasTracker, isLiveMain),
      }).addTo(markers);
      boundsPoints.push([v.lat, v.lng]);

      const codeSafe = escapeHtml(v.code);
      const missionHint = v.activeTripId
        ? `<span style="font-size:10px;color:#3b82f6;">Active mission</span>`
        : `<span style="font-size:10px;color:#94a3b8;">No active trip</span>`;
      const hoverHtml = `
        <div class="fleet-map-hover-actions">
          <div style="font-weight:700;font-size:13px;margin-bottom:2px;color:#0f172a;">${codeSafe}</div>
          <div style="margin-bottom:8px;">${missionHint}</div>
          <button type="button" data-fleet-action="vehicle" style="display:block;width:100%;margin-bottom:6px;padding:8px 10px;border-radius:8px;border:none;background:#0f172a;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">Vehicle card</button>
          <button type="button" data-fleet-action="mission" style="display:block;width:100%;padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-size:12px;font-weight:600;cursor:pointer;">Mission card</button>
        </div>`;
      marker.bindTooltip(hoverHtml, {
        direction: "top",
        offset: [0, -12],
        className: "fleet-tooltip fleet-tooltip-actions",
        opacity: 1,
        interactive: true,
      });

      marker.on("tooltipopen", () => {
        const tip = marker.getTooltip();
        const el = tip?.getElement();
        if (!el) return;
        const onVehicle = (e: Event) => {
          e.stopPropagation();
          marker.closeTooltip();
          onVehicleClickRef.current?.(v.id);
        };
        const onMission = (e: Event) => {
          e.stopPropagation();
          marker.closeTooltip();
          onMissionClickRef.current?.(v.id, v.activeTripId ?? null);
        };
        el.querySelector('[data-fleet-action="vehicle"]')?.addEventListener("click", onVehicle, { once: true });
        el.querySelector('[data-fleet-action="mission"]')?.addEventListener("click", onMission, { once: true });
      });

      const gpsBadge =
        rewindHours > 0
          ? `<span style="background:#7c3aed;color:white;padding:1px 6px;border-radius:9px;font-size:10px;">MAP REWIND</span>`
          : v.gpsLive
            ? `<span style="background:#3b82f6;color:white;padding:1px 6px;border-radius:9px;font-size:10px;">LIVE GPS</span>`
            : hasTracker
              ? `<span style="background:#10b981;color:white;padding:1px 6px;border-radius:9px;font-size:10px;">GPS (offline)</span>`
              : `<span style="background:#6b7280;color:white;padding:1px 6px;border-radius:9px;font-size:10px;">No GPS</span>`;

      const gpsTime = v.gpsTimestamp
        ? new Date(v.gpsTimestamp * 1000).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "short", timeStyle: "short" })
        : null;
      const gpsInfo = v.gpsLive
        ? `<div style="font-size:11px;color:#3b82f6;margin-top:4px;">📡 Last: ${gpsTime}${v.gpsSpeed !== null ? ` · ${v.gpsSpeed} km/h` : ""}</div>`
        : v.gpsTimestamp
          ? `<div style="font-size:11px;color:#94a3b8;margin-top:4px;">Last GPS: ${gpsTime}</div>`
          : "";

      const missionHref = v.activeTripId
        ? `/trips?trip=${encodeURIComponent(v.activeTripId)}`
        : `/trips?vehicle=${encodeURIComponent(v.id)}`;

      const refTimeLabel =
        rewindHours > 0 && v.refTimeUnix
          ? new Date(v.refTimeUnix * 1000).toLocaleString("en-ZA", {
              timeZone: "Africa/Johannesburg",
              dateStyle: "short",
              timeStyle: "short",
            })
          : "";

      marker.bindPopup(`
        <div style="min-width:180px;font-family:system-ui;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${escapeHtml(v.code)}</div>
          <div style="color:#64748b;font-size:12px;margin-bottom:6px;">${escapeHtml(v.make)} ${escapeHtml(v.model)}</div>
          ${
            refTimeLabel
              ? `<div style="font-size:11px;color:#7c3aed;margin-bottom:6px;font-weight:600;">⏪ Map time: ${escapeHtml(refTimeLabel)}</div>`
              : ""
          }
          <div style="font-size:12px;margin-bottom:2px;"><b>Plate:</b> ${escapeHtml(v.licensePlate || "—")}</div>
          <div style="font-size:12px;margin-bottom:2px;"><b>Location:</b> ${escapeHtml(v.currentLocation)}${v.gpsLive ? " (live)" : ""}</div>
          <div style="font-size:12px;margin-bottom:2px;"><b>Status:</b> ${escapeHtml(v.status)}</div>
          <div style="font-size:12px;margin-bottom:4px;">${gpsBadge}</div>
          ${gpsInfo}
          ${v.trackerImei ? `<div style="font-size:11px;color:#94a3b8;">IMEI: ${escapeHtml(v.trackerImei)}</div>` : ""}
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <a href="/vehicles/${encodeURIComponent(v.id)}" style="flex:1;min-width:100px;text-align:center;padding:8px 10px;border-radius:8px;background:#0f172a;color:#fff!important;font-size:12px;font-weight:600;text-decoration:none;">Vehicle card</a>
            <a href="${missionHref}" style="flex:1;min-width:100px;text-align:center;padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a!important;font-size:12px;font-weight:600;text-decoration:none;">Mission card</a>
          </div>
        </div>
      `);

    });

    if (boundsPoints.length > 0) {
      const bounds = L.latLngBounds(boundsPoints);
      leafletMap.current!.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
    }
  }, [vehicles, sites, filter, isLoading, handleMeasureClick, rewindHours]);

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
  const liveGpsCount = vehicles.filter((v) => v.gpsLive).length;

  const refDisplay =
    vehicles[0]?.refTimeUnix != null
      ? new Date(vehicles[0].refTimeUnix * 1000).toLocaleString("en-ZA", {
          timeZone: "Africa/Johannesburg",
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "";

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
        .fleet-tooltip.fleet-tooltip-actions {
          background: #fff !important;
          color: #0f172a !important;
          padding: 10px 12px !important;
          max-width: 220px !important;
          border: 1px solid #e2e8f0 !important;
          box-shadow: 0 10px 25px rgba(0,0,0,0.12) !important;
        }
        .fleet-tooltip.fleet-tooltip-actions::before {
          border-top-color: #fff !important;
        }
        .fleet-map-hover-actions button:hover {
          filter: brightness(1.05);
        }
        .fleet-tooltip::before {
          border-top-color: rgba(15, 23, 42, 0.9) !important;
        }
        .fleet-marker { background: none !important; border: none !important; }
        .site-label { background: none !important; border: none !important; }
        .measure-label { background: none !important; border: none !important; }
      `}</style>

      <div className="mb-3 rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-violet-900 whitespace-nowrap">Map rewind</span>
          <input
            type="range"
            min={0}
            max={144}
            step={1}
            value={rewindHours}
            onChange={(e) => setRewindHours(Number(e.target.value))}
            className="flex-1 min-w-[120px] h-2 rounded-full accent-violet-600 cursor-pointer"
            aria-label="Rewind map time in hours"
          />
          <span className="text-xs font-mono text-violet-800 tabular-nums min-w-[7rem]">
            {rewindHours === 0 ? "Now" : `${rewindHours}h ago`}
          </span>
          {rewindHours > 0 && (
            <button
              type="button"
              onClick={() => setRewindHours(0)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
            >
              Jump to now
            </button>
          )}
        </div>
        {rewindHours > 0 && refDisplay && (
          <p className="text-[11px] text-violet-700 mt-1.5">Showing positions near: {refDisplay}</p>
        )}
        <p className="text-[11px] text-slate-500 mt-1.5">
          Each tracked vehicle can show up to six markers: map time (solid) and 1h–5h before that time when snapshots exist, linked by a shaded line.
        </p>
      </div>

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
          onClick={() => setFilter("live-gps")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            filter === "live-gps" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100"
          }`}
        >
          Live GPS ({liveGpsCount})
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
          <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-500 bg-transparent animate-pulse" />
          Live GPS
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-emerald-500 bg-transparent" />
          GPS tracked
        </span>
      </div>

      <div ref={mapRef} className="flex-1 rounded-xl border border-slate-200 shadow-sm" style={{ minHeight: 500 }} />
    </div>
  );
}
