"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { SiteCoordsPicker } from "@/components/SiteCoordsPicker";
import {
  calculateFuelBudget,
  DEFAULT_FUEL_SAFETY_FACTOR,
  kmPerLToLPer100,
  lPer100ToKmPerL,
  type FuelDisposition,
} from "@/lib/fuel-calculator";
import type { MissionFuelSnapshot } from "@/lib/fuel-estimate";

export type FuelStopDraft = {
  label: string;
  siteCode?: string;
  lat: number | null;
  lng: number | null;
};

type EstimateResponse = {
  ok: boolean;
  message?: string | null;
  currency?: string;
  economySource?: string;
  route?: {
    roadKm: number;
    estimatedKm: number;
    totalKm: number;
  } | null;
  legs?: Array<{
    labelFrom?: string;
    labelTo?: string;
    distanceKm: number;
    source: "road" | "estimated";
  }>;
  budget?: {
    litres: number;
    cost: number;
    budget: number;
    kmPerLitre: number;
    lPer100km: number;
    pumpPricePerLitre: number;
    safetyFactor: number;
  } | null;
};

type OrgDefaults = {
  currency: string;
  safetyFactor: number;
  defaultPumpPrice: number | null;
};

type VehicleOpt = { id: string; code: string; make: string; model: string };

interface FuelBudgetPanelProps {
  organizationId: string;
  tripShape: "one_way" | "round_trip" | "multi_stop";
  /** Ordered waypoints (start first). */
  stops: FuelStopDraft[];
  onStopsChange?: (stops: FuelStopDraft[]) => void;
  /** When true, hide stop editing (parent owns the route). */
  routeLocked?: boolean;
  disposition: FuelDisposition;
  onDispositionChange: (d: FuelDisposition) => void;
  onSnapshotChange?: (snap: MissionFuelSnapshot | null, fields: Record<string, unknown>) => void;
  compact?: boolean;
}

export function FuelBudgetPanel({
  organizationId,
  tripShape,
  stops,
  onStopsChange,
  routeLocked,
  disposition,
  onDispositionChange,
  onSnapshotChange,
  compact,
}: FuelBudgetPanelProps): React.ReactElement {
  const [defaults, setDefaults] = useState<OrgDefaults | null>(null);
  const [vehicles, setVehicles] = useState<VehicleOpt[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [kmPerLitre, setKmPerLitre] = useState("");
  const [lPer100, setLPer100] = useState("");
  const [pumpPrice, setPumpPrice] = useState("");
  const [safetyFactor, setSafetyFactor] = useState(String(DEFAULT_FUEL_SAFETY_FACTOR));
  const [currency, setCurrency] = useState("LSL");
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [pinIndex, setPinIndex] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const headers = await jsonHeadersWithBearer();
        const [dRes, vRes] = await Promise.all([
          fetch(`/api/fuel-calculator/defaults?org=${encodeURIComponent(organizationId)}`, {
            headers,
          }),
          fetch(`/api/vehicles?org=${encodeURIComponent(organizationId)}`, { headers }),
        ]);
        if (dRes.ok) {
          const d = (await dRes.json()) as OrgDefaults;
          setDefaults(d);
          setCurrency(d.currency || "LSL");
          setSafetyFactor(String(d.safetyFactor || DEFAULT_FUEL_SAFETY_FACTOR));
          if (d.defaultPumpPrice != null && d.defaultPumpPrice > 0) {
            setPumpPrice(String(d.defaultPumpPrice));
          }
        }
        if (vRes.ok) {
          const list = (await vRes.json()) as VehicleOpt[];
          setVehicles(Array.isArray(list) ? list.filter((v) => v.code !== "PUBLIC-TRANSPORT") : []);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [organizationId]);

  const runEstimate = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await jsonHeadersWithBearer();
      const km = parseFloat(kmPerLitre);
      const l100 = parseFloat(lPer100);
      const body: Record<string, unknown> = {
        organizationId,
        tripShape,
        waypoints: stops.map((s) => ({
          label: s.label,
          siteCode: s.siteCode || s.label,
          lat: s.lat,
          lng: s.lng,
        })),
        vehicleId: vehicleId || null,
        pumpPricePerLitre: parseFloat(pumpPrice) || null,
        safetyFactor: parseFloat(safetyFactor) || DEFAULT_FUEL_SAFETY_FACTOR,
        currency,
      };
      if (Number.isFinite(km) && km > 0) body.kmPerLitre = km;
      if (Number.isFinite(l100) && l100 > 0) body.lPer100km = l100;

      const res = await fetch("/api/fuel-calculator/estimate", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as EstimateResponse;
      setEstimate(j);

      if (j.budget && j.route) {
        const snap: MissionFuelSnapshot = {
          fuel_road_km: j.route.roadKm,
          fuel_estimated_km: j.route.estimatedKm,
          fuel_total_km: j.route.totalKm,
          fuel_economy_km_per_l: j.budget.kmPerLitre,
          fuel_economy_l_per_100km: j.budget.lPer100km,
          fuel_pump_price: j.budget.pumpPricePerLitre,
          fuel_currency: j.currency || currency,
          fuel_safety_factor: j.budget.safetyFactor,
          fuel_liters: j.budget.litres,
          fuel_cost: j.budget.cost,
          fuel_budget: j.budget.budget,
          fuel_legs_json: JSON.stringify(
            (j.legs || []).map((l) => ({
              from: l.labelFrom,
              to: l.labelTo,
              km: l.distanceKm,
              source: l.source,
            }))
          ),
          fuel_disposition: disposition,
        };
        onSnapshotChange?.(snap, {
          fuelKmPerLitre: j.budget.kmPerLitre,
          fuelLPer100km: j.budget.lPer100km,
          fuelPumpPrice: j.budget.pumpPricePerLitre,
          fuelSafetyFactor: j.budget.safetyFactor,
          fuelCurrency: j.currency || currency,
          fuelVehicleId: vehicleId || null,
          fuelDisposition: disposition,
          fuel: snap,
        });
      } else {
        onSnapshotChange?.(null, {
          fuelDisposition: disposition,
          fuelPumpPrice: parseFloat(pumpPrice) || null,
          fuelSafetyFactor: parseFloat(safetyFactor) || null,
          fuelCurrency: currency,
          fuelVehicleId: vehicleId || null,
          fuelKmPerLitre: parseFloat(kmPerLitre) || null,
          fuelLPer100km: parseFloat(lPer100) || null,
        });
      }
    } catch {
      setEstimate({ ok: false, message: "Network error estimating fuel." });
      onSnapshotChange?.(null, {});
    } finally {
      setLoading(false);
    }
  }, [
    organizationId,
    tripShape,
    stops,
    vehicleId,
    kmPerLitre,
    lPer100,
    pumpPrice,
    safetyFactor,
    currency,
    disposition,
    onSnapshotChange,
  ]);

  // Local worked-example preview when user types without waiting for OSRM
  const localPreview =
    estimate?.budget ??
    (() => {
      const dist = estimate?.route?.totalKm;
      const km = parseFloat(kmPerLitre);
      const price = parseFloat(pumpPrice);
      const factor = parseFloat(safetyFactor) || DEFAULT_FUEL_SAFETY_FACTOR;
      if (dist != null && km > 0 && price > 0) {
        return calculateFuelBudget({
          distanceKm: dist,
          kmPerLitre: km,
          pumpPricePerLitre: price,
          safetyFactor: factor,
        });
      }
      return null;
    })();

  return (
    <Card className={compact ? "border-zinc-200" : "border-amber-200"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          Fuel budget
          <Badge variant="secondary" className="text-[10px]">
            Excel formula
          </Badge>
          {!compact && (
            <Link href="/fuel-calculator" className="text-xs font-normal text-blue-700 underline ml-auto">
              Open standalone calculator
            </Link>
          )}
        </CardTitle>
        <p className="text-sm text-zinc-600 font-normal">
          Litres = km ÷ km/L · cost = litres × pump price · budget = cost × safety factor (not a distance fudge).
          Road legs use OSRM; missing routes use straight-line × 1.4.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!routeLocked && onStopsChange && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-800">Stops (in order)</p>
            {stops.map((s, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-end border border-zinc-100 rounded-lg p-2">
                <Input
                  label={i === 0 ? "Start" : `Stop ${i}`}
                  value={s.label}
                  onChange={(e) => {
                    const next = [...stops];
                    next[i] = { ...next[i], label: e.target.value, siteCode: e.target.value };
                    onStopsChange(next);
                  }}
                  className="min-w-[10rem] flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setPinIndex(pinIndex === i ? null : i)}>
                  {s.lat != null ? "Edit pin" : "Map pin"}
                </Button>
                {stops.length > 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onStopsChange(stops.filter((_, j) => j !== i))}
                  >
                    Remove
                  </Button>
                )}
                {pinIndex === i && (
                  <div className="w-full space-y-1">
                    <SiteCoordsPicker
                      organizationId={organizationId}
                      lat={s.lat ?? -29.315}
                      lng={s.lng ?? 27.487}
                      onChange={(lat, lng) => {
                        const next = [...stops];
                        next[i] = { ...next[i], lat, lng };
                        onStopsChange(next);
                      }}
                    />
                    <p className="text-[11px] text-zinc-500">
                      {s.lat != null ? `${s.lat.toFixed(5)}, ${s.lng?.toFixed(5)}` : "Click map to set coordinates"}
                    </p>
                  </div>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onStopsChange([...stops, { label: "", siteCode: "", lat: null, lng: null }])}
            >
              Add stop
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-zinc-700 block mb-1">Vehicle (optional)</label>
            <select
              className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              <option value="">Manual economy</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {v.make} {v.model}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Economy (km/L)"
            value={kmPerLitre}
            onChange={(e) => {
              setKmPerLitre(e.target.value);
              const n = parseFloat(e.target.value);
              if (n > 0) setLPer100(String(Math.round(kmPerLToLPer100(n) * 100) / 100));
            }}
            placeholder="e.g. 10"
          />
          <Input
            label="Economy (L/100 km)"
            value={lPer100}
            onChange={(e) => {
              setLPer100(e.target.value);
              const n = parseFloat(e.target.value);
              if (n > 0) setKmPerLitre(String(Math.round(lPer100ToKmPerL(n) * 100) / 100));
            }}
            placeholder="e.g. 10"
          />
          <Input
            label={`Pump price (${currency}/L)`}
            value={pumpPrice}
            onChange={(e) => setPumpPrice(e.target.value)}
            placeholder={defaults?.defaultPumpPrice ? String(defaults.defaultPumpPrice) : "e.g. 20"}
          />
          <Input
            label="Safety factor"
            value={safetyFactor}
            onChange={(e) => setSafetyFactor(e.target.value)}
          />
          <Input label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Button type="button" onClick={() => void runEstimate()} disabled={loading || stops.length < 2}>
            {loading ? "Calculating…" : "Calculate fuel budget"}
          </Button>
          {estimate?.economySource ? (
            <span className="text-xs text-zinc-500">Economy source: {estimate.economySource}</span>
          ) : null}
        </div>

        {estimate?.message && (
          <p className={`text-sm ${estimate.ok ? "text-amber-800" : "text-red-700"}`}>{estimate.message}</p>
        )}

        {estimate?.route && (
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm space-y-1">
            <p>
              <strong>{estimate.route.totalKm} km</strong> total
              {estimate.route.roadKm > 0 ? ` · ${estimate.route.roadKm} km road` : ""}
              {estimate.route.estimatedKm > 0 ? ` · ${estimate.route.estimatedKm} km estimated` : ""}
            </p>
            <ul className="text-xs text-zinc-600 space-y-0.5">
              {(estimate.legs || []).map((l, i) => (
                <li key={i}>
                  {l.labelFrom || "?"} → {l.labelTo || "?"}: {l.distanceKm} km{" "}
                  <Badge variant={l.source === "road" ? "success" : "warning"} className="text-[9px]">
                    {l.source}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {localPreview && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 space-y-1">
            <p>
              <strong>{localPreview.litres} L</strong> · cost {localPreview.cost} {currency} ·{" "}
              <strong>budget {localPreview.budget} {currency}</strong>
              {" "}(factor {localPreview.safetyFactor})
            </p>
            <p className="text-xs">
              {localPreview.kmPerLitre} km/L (= {localPreview.lPer100km} L/100 km) @ {localPreview.pumpPricePerLitre}{" "}
              {currency}/L
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-800">What happens with this budget?</p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="fuel-disposition"
              checked={disposition === "pr_requested"}
              onChange={() => onDispositionChange("pr_requested")}
            />
            <span>Request a fuel PR (stored on the mission; PR creation is a later step)</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="fuel-disposition"
              checked={disposition === "in_deployment_budget"}
              onChange={() => onDispositionChange("in_deployment_budget")}
            />
            <span>Included in a deployment budget (stored; wizard is a later step)</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="fuel-disposition"
              checked={disposition === ""}
              onChange={() => onDispositionChange("")}
            />
            <span>Decide later</span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
