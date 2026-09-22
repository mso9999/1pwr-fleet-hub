"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildFleetPerformance,
  type FleetSourceData,
  type VehicleMetric,
} from "@/lib/fleet-performance";

type Props = {
  vehicleId: string;
  vehicleCode: string;
};

/**
 * Single-vehicle performance (odo + spend cumulative, figures of merit).
 * Comparison across the fleet lives on /tco.
 */
export function VehiclePerformancePanel({ vehicleId, vehicleCode }: Props): ReactElement {
  const [data, setData] = useState<FleetSourceData | null>(null);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/analytics/fleet-performance")
      .then((res) => {
        if (!res.ok) throw new Error("Could not load performance");
        return res.json() as Promise<FleetSourceData>;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load performance.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const vehicle = useMemo(
    () => data?.vehicles.find((row) => row.id === vehicleId) ?? null,
    [data, vehicleId]
  );

  const perf = useMemo(() => {
    if (!data || !vehicle) return null;
    return buildFleetPerformance({
      vehicles: [vehicle],
      odo: data.odo.filter((point) => point.vehicleId === vehicleId),
      repairs: data.repairs.filter((event) => event.vehicleId === vehicleId),
      downtime: data.downtime.filter((span) => span.vehicleId === vehicleId),
      from: from || null,
      to: to || null,
      asOf: data.asOf,
    });
  }, [data, vehicle, vehicleId, from, to]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!data || !perf) {
    return <p className="text-sm text-zinc-500 py-6 text-center">Loading performance…</p>;
  }
  if (!vehicle) {
    return <p className="text-sm text-zinc-500 py-6 text-center">No performance data for {vehicleCode}.</p>;
  }

  const metric: VehicleMetric | undefined = perf.metrics[0];
  const currency = vehicle.currency || "LSL";
  const purchaseMissing = !vehicle.purchasePrice || vehicle.purchasePrice <= 0;
  const odoSeries = [{
    name: vehicle.code,
    color: "#1e4d3a",
    values: perf.months.map((point) => point.odo),
  }];
  const spendSeries = [{
    name: vehicle.code,
    color: "#1d4ed8",
    values: perf.months.map((point) => point.spend),
  }];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-zinc-600 max-w-2xl">
          Rising odometer only
          {perf.excludedNonMonotonic > 0
            ? ` (${perf.excludedNonMonotonic} non-monotonic left out, ${perf.readingsKept} kept)`
            : ""}.
          Spend is purchase (if recorded) plus work-order / PR repairs.
          {purchaseMissing
            ? " Purchase price is missing on this vehicle — TCO is repairs only until it is filled in."
            : ""}
        </p>
        <Link href="/tco" className="text-sm text-blue-700 hover:underline whitespace-nowrap">
          Compare across fleet →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border border-zinc-200 px-2 text-sm font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border border-zinc-200 px-2 text-sm font-normal"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            className="h-9 text-sm text-zinc-600 underline"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            All time
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Latest odometer" value={fmt(metric?.latestOdo ?? null, 0)} detail={`${fmt(metric?.kmPerYear ?? null, 0)} km/yr`} />
        <Stat
          label="Total cost of ownership"
          value={money(metric?.tco ?? 0, currency)}
          detail={`${money(metric?.purchasePrice ?? 0, currency)} purchase · ${money(metric?.repairSpend ?? 0, currency)} repairs`}
        />
        <Stat
          label="TCO per km / year"
          value={fmt(metric?.tcoPerKmYear ?? null, 2)}
          detail={metric?.costPerKm != null ? `${fmt(metric.costPerKm, 2)} ${currency}/km on clock` : "Need ≥90 days rising odo"}
        />
        <Stat
          label="Downtime"
          value={`${fmt(metric?.downtimeDays ?? 0, 0)} d`}
          detail={metric?.ageYears != null ? `Age ${metric.ageYears} yr` : "Age unknown"}
        />
      </div>

      <Card>
        <CardHeader><CardTitle>Cumulative odometer</CardTitle></CardHeader>
        <CardContent>
          <LineChart months={perf.months.map((point) => point.month)} series={odoSeries} zero={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cumulative spend ({currency})</CardTitle></CardHeader>
        <CardContent>
          <LineChart months={perf.months.map((point) => point.month)} series={spendSeries} zero />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }): ReactElement {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-[11px] text-zinc-400 mt-1">{detail}</div>
    </div>
  );
}

function LineChart({
  months,
  series,
  zero,
}: {
  months: string[];
  series: { name: string; color: string; values: (number | null)[] }[];
  zero: boolean;
}): ReactElement {
  const nums = series.flatMap((line) => line.values.filter((value): value is number => value != null));
  if (months.length === 0 || nums.length === 0) {
    return <p className="text-sm text-zinc-500">No points in this range.</p>;
  }
  const width = 720;
  const height = 220;
  const pad = { l: 64, r: 16, t: 12, b: 28 };
  const min = zero ? 0 : Math.min(...nums);
  const max = Math.max(...nums, min + 1);
  const x = (index: number) =>
    pad.l + (months.length === 1 ? (width - pad.l - pad.r) / 2 : (index / (months.length - 1)) * (width - pad.l - pad.r));
  const y = (value: number) => pad.t + (1 - (value - min) / (max - min)) * (height - pad.t - pad.b);
  const ticks = [min, min + (max - min) / 2, max];
  const labelEvery = Math.max(1, Math.ceil(months.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img">
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} stroke="#e7e5e4" />
          <text x={pad.l - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#78716c">{compact(tick)}</text>
        </g>
      ))}
      {series.map((line) => (
        <path key={line.name} d={linePath(line.values, x, y)} fill="none" stroke={line.color} strokeWidth="2" />
      ))}
      {months.map((month, index) =>
        index % labelEvery === 0 ? (
          <text key={month} x={x(index)} y={height - 8} textAnchor="middle" fontSize="11" fill="#78716c">
            {month}
          </text>
        ) : null
      )}
    </svg>
  );
}

function linePath(values: (number | null)[], x: (index: number) => number, y: (value: number) => number): string {
  let path = "";
  let open = false;
  values.forEach((value, index) => {
    if (value == null) {
      open = false;
      return;
    }
    path += `${open ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
    open = true;
  });
  return path;
}

function fmt(value: number | null, digits: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function money(value: number, currency: string): string {
  return `${currency} ${fmt(value, 0)}`;
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}
