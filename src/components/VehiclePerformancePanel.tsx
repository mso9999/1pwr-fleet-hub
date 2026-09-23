"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildFleetPerformance,
  type FleetSourceData,
  type VehicleMetric,
} from "@/lib/fleet-performance";
import { DualAxisLineChart, LineChart, fmt } from "@/components/fleet-performance-charts";

type Props = {
  vehicleId: string;
  vehicleCode: string;
};

/**
 * Single-vehicle performance (odo + repair spend overlay, figures of merit).
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
  const woTotal = metric?.workOrderCount ?? vehicle.workOrderCount ?? 0;
  const woCosted = metric?.workOrdersWithCost ?? vehicle.workOrdersWithCost ?? 0;
  const woMissing = Math.max(0, woTotal - woCosted);
  const months = perf.months.map((point) => point.month);
  const odoLeft = [{
    name: vehicle.code,
    color: "#1e4d3a",
    values: perf.months.map((point) => point.odo),
  }];
  const repairRight = [{
    name: vehicle.code,
    color: "#1d4ed8",
    values: perf.months.map((point) => point.repair),
    dashed: true,
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
          Repair spend uses work-order costs (max of WO / lines / linked PR-PO) plus approved
          PR spend tagged to this vehicle even when no work order is linked. PR cache refreshes hourly from the PR system.
          {purchaseMissing
            ? " Purchase price is missing — TCO is repairs only until it is filled in."
            : ""}
        </p>
        <Link href="/tco" className="text-sm text-blue-700 hover:underline whitespace-nowrap">
          Compare across fleet →
        </Link>
      </div>

      {woMissing > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Cost coverage: <strong>{woCosted}</strong> of <strong>{woTotal}</strong> work orders have a recorded
          amount{woMissing > 0 ? ` — ${woMissing} jobs still have no WO cost` : ""}.
          Unlinked PR spend still counts when the PR names this vehicle.
        </div>
      )}

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
          label="Recorded repair spend"
          value={money(metric?.repairSpend ?? 0, currency)}
          detail={`${woCosted}/${woTotal} WOs costed · ${money(metric?.purchasePrice ?? 0, currency)} purchase`}
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
        <CardHeader>
          <CardTitle>Odometer with cumulative repairs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500 mb-2">
            Solid line = odometer (left axis). Dashed line = cumulative recorded repair spend (right axis).
          </p>
          <DualAxisLineChart
            months={months}
            left={odoLeft}
            right={repairRight}
            rightLabel={currency}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cumulative spend ({currency})</CardTitle></CardHeader>
        <CardContent>
          <LineChart months={months} series={spendSeries} zero />
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

function money(value: number, currency: string): string {
  return `${currency} ${fmt(value, 0)}`;
}
