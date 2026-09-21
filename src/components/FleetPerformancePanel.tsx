"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  buildFleetPerformance,
  type FleetPerformance,
  type FleetSourceData,
  type MonthPoint,
} from "@/lib/fleet-performance";

const COLORS = ["#1e4d3a", "#1d4ed8", "#b45309", "#be123c", "#6d28d9", "#0f766e", "#0369a1", "#a16207", "#334155", "#9f1239"];

export function FleetPerformancePanel({ organizationId }: { organizationId: string }): ReactElement {
  const [data, setData] = useState<FleetSourceData | null>(null);
  const [error, setError] = useState("");
  const [country, setCountry] = useState("");
  const [vehicleId, setVehicleId] = useState("all");
  const [split, setSplit] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/analytics/fleet-performance")
      .then((res) => {
        if (!res.ok) throw new Error("Could not load fleet performance");
        return res.json() as Promise<FleetSourceData>;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load fleet performance.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    const org = data.organizations.find((row) => row.id === organizationId);
    setCountry(org?.country || data.organizations[0]?.country || "all");
    setVehicleId("all");
  }, [data, organizationId]);

  const countries = useMemo(() => {
    const seen = new Map<string, string>();
    for (const org of data?.organizations ?? []) {
      if (!seen.has(org.country)) seen.set(org.country, org.name);
    }
    return [...seen.entries()];
  }, [data]);

  const inCountry = useMemo(() => {
    if (!data) return [];
    return data.vehicles.filter((vehicle) => country === "all" || vehicle.country === country);
  }, [data, country]);

  const selected = useMemo(() => {
    if (vehicleId === "all") return inCountry;
    return inCountry.filter((vehicle) => vehicle.id === vehicleId);
  }, [inCountry, vehicleId]);

  const currencies = useMemo(() => [...new Set(selected.map((vehicle) => vehicle.currency))], [selected]);
  const moneyOk = currencies.length === 1;
  const currency = currencies[0] || "";

  const perf: FleetPerformance | null = useMemo(() => {
    if (!data || selected.length === 0) return null;
    const ids = new Set(selected.map((vehicle) => vehicle.id));
    return buildFleetPerformance({
      vehicles: selected,
      odo: data.odo.filter((point) => ids.has(point.vehicleId)),
      repairs: data.repairs.filter((event) => ids.has(event.vehicleId)),
      downtime: data.downtime.filter((span) => ids.has(span.vehicleId)),
      from: from || null,
      to: to || null,
      asOf: data.asOf,
    });
  }, [data, selected, from, to]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!data || !perf) return <p className="text-sm text-zinc-500 py-8 text-center">Loading fleet performance…</p>;

  const showEach = split && vehicleId === "all";
  const odoSeries = seriesFrom(perf.months, showEach, "odo");
  const spendSeries = seriesFrom(perf.months, showEach, "spend");

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 max-w-3xl">
        Odometer readings that would make a vehicle&apos;s series fall are left out until the photo review is finished
        {perf.excludedNonMonotonic > 0 ? ` (${perf.excludedNonMonotonic} left out, ${perf.readingsKept} kept)` : ""}.
        Repair spend is the work-order total (parts, labour, and third party). A purchase-request amount is used only when that work order has no cost of its own, so the two are not added twice.
        Open work orders count as downtime through today; overlapping orders on the same vehicle are counted once.
        {perf.portfolio.totalPurchase === 0
          ? " Purchase prices are not on the vehicle records yet, so total cost of ownership is repairs only."
          : " Purchase price is included from the vehicle record."}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Select label="Country" value={country} onChange={(e) => { setCountry(e.target.value); setVehicleId("all"); }}>
          <option value="all">All countries</option>
          {countries.map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </Select>
        <Select label="Vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="all">All vehicles</option>
          {inCountry.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>{vehicle.code}</option>
          ))}
        </Select>
        <Select label="Lines" value={showEach ? "each" : "sum"} onChange={(e) => setSplit(e.target.value === "each")} disabled={vehicleId !== "all"}>
          <option value="sum">One portfolio line</option>
          <option value="each">One line per vehicle</option>
        </Select>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-lg border border-zinc-200 px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-lg border border-zinc-200 px-3 font-normal" />
        </label>
        <div className="flex items-end">
          <button type="button" className="h-10 text-sm text-zinc-600 underline" onClick={() => { setFrom(""); setTo(""); }}>
            All time
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Mean km / year" value={fmt(perf.portfolio.meanKmPerYear, 0)} detail={spread(perf.portfolio.stdevKmPerYear, perf.portfolio.ratedVehicles, "km/yr")} />
        <Stat label="Total cost of ownership" value={moneyOk ? money(perf.portfolio.totalTco, currency) : "—"} detail={moneyOk ? `${money(perf.portfolio.totalPurchase, currency)} purchase · ${money(perf.portfolio.totalRepairs, currency)} repairs` : "Pick one country"} />
        <Stat label="TCO per km / year" value={moneyOk ? fmt(perf.portfolio.meanTcoPerKmYear, 0) : "—"} detail={moneyOk ? spread(perf.portfolio.stdevTcoPerKmYear, perf.portfolio.ratedVehicles, currency) : "Currencies differ"} />
        <Stat label="TCO per km on the clock" value={moneyOk ? fmt(perf.portfolio.costPerKm, 2) : "—"} detail={`${fmt(perf.portfolio.totalDowntimeDays, 0)} downtime days`} />
      </div>

      <Card>
        <CardHeader><CardTitle>Cumulative odometer</CardTitle></CardHeader>
        <CardContent>
          <LineChart months={perf.months.map((point) => point.month)} series={odoSeries} zero={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cumulative spend{moneyOk ? ` (${currency})` : ""}</CardTitle></CardHeader>
        <CardContent>
          {moneyOk ? (
            <LineChart months={perf.months.map((point) => point.month)} series={spendSeries} zero />
          ) : (
            <p className="text-sm text-zinc-500">Spend is not added across countries because the currencies differ. Choose one country.</p>
          )}
        </CardContent>
      </Card>

      {moneyOk && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Spend by odometer bracket</CardTitle></CardHeader>
            <CardContent><BarChart bars={perf.odoBrackets.map((bar) => ({ label: bar.label, value: bar.spend }))} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Spend by age</CardTitle></CardHeader>
            <CardContent><BarChart bars={perf.ageBrackets.map((bar) => ({ label: bar.label, value: bar.spend }))} /></CardContent>
          </Card>
        </div>
      )}

      {moneyOk && (
        <Card>
          <CardHeader>
            <CardTitle>TCO per km/year, by vehicle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-zinc-500">
              Mean {fmt(perf.portfolio.meanTcoPerKmYear, 0)} {currency}, sample standard deviation {fmt(perf.portfolio.stdevTcoPerKmYear, 0)}, median {fmt(perf.portfolio.medianTcoPerKmYear, 0)}.
              {" "}{perf.portfolio.ratedVehicles} vehicles have both a cost and at least 90 days of rising odometer. The rest are left out of the distribution.
            </p>
            <BarChart
              bars={perf.metrics
                .filter((metric) => metric.tcoPerKmYear != null)
                .sort((a, b) => (b.tcoPerKmYear ?? 0) - (a.tcoPerKmYear ?? 0))
                .map((metric) => ({ label: metric.code, value: metric.tcoPerKmYear ?? 0 }))}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Figures of merit</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-zinc-500 uppercase">
                <th className="pb-2 pr-3">Vehicle</th>
                <th className="pb-2 pr-3 text-right">Odometer</th>
                <th className="pb-2 pr-3 text-right">km/yr</th>
                <th className="pb-2 pr-3 text-right">Age</th>
                <th className="pb-2 pr-3 text-right">Purchase</th>
                <th className="pb-2 pr-3 text-right">Repairs</th>
                <th className="pb-2 pr-3 text-right">TCO</th>
                <th className="pb-2 pr-3 text-right">TCO/km</th>
                <th className="pb-2 pr-3 text-right">TCO ÷ km/yr</th>
                <th className="pb-2 text-right">Down days</th>
              </tr>
            </thead>
            <tbody>
              {[...perf.metrics]
                .sort((a, b) => (b.tcoPerKmYear ?? -1) - (a.tcoPerKmYear ?? -1))
                .map((metric) => (
                  <tr key={metric.id} className="border-b border-zinc-50">
                    <td className="py-2 pr-3 font-semibold">{metric.code}</td>
                    <td className="py-2 pr-3 text-right">{fmt(metric.latestOdo, 0)}</td>
                    <td className="py-2 pr-3 text-right">{fmt(metric.kmPerYear, 0)}</td>
                    <td className="py-2 pr-3 text-right">{metric.ageYears == null ? "—" : metric.ageYears}</td>
                    <td className="py-2 pr-3 text-right">{moneyOk ? fmt(metric.purchasePrice, 0) : "—"}</td>
                    <td className="py-2 pr-3 text-right">{moneyOk ? fmt(metric.repairSpend, 0) : "—"}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{moneyOk ? fmt(metric.tco, 0) : "—"}</td>
                    <td className="py-2 pr-3 text-right">{moneyOk ? fmt(metric.costPerKm, 2) : "—"}</td>
                    <td className="py-2 pr-3 text-right">{moneyOk ? fmt(metric.tcoPerKmYear, 0) : "—"}</td>
                    <td className="py-2 text-right">{fmt(metric.downtimeDays, 0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function seriesFrom(months: MonthPoint[], each: boolean, field: "odo" | "spend"): { name: string; color: string; values: (number | null)[] }[] {
  if (!each) {
    return [{
      name: "Portfolio",
      color: COLORS[0],
      values: months.map((point) => (field === "odo" ? point.odo : point.spend)),
    }];
  }
  const names = [...new Set(months.flatMap((point) => Object.keys(point.byVehicle)))];
  return names.map((name, index) => ({
    name,
    color: COLORS[index % COLORS.length],
    values: months.map((point) => point.byVehicle[name]?.[field] ?? null),
  }));
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }): ReactElement {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-zinc-500">{label}</div>
        <div className="text-[11px] text-zinc-400 mt-1">{detail}</div>
      </CardContent>
    </Card>
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
  const height = 260;
  const pad = { l: 64, r: 16, t: 12, b: 28 };
  const min = zero ? 0 : Math.min(...nums);
  const max = Math.max(...nums, min + 1);
  const x = (index: number) => pad.l + (months.length === 1 ? (width - pad.l - pad.r) / 2 : (index / (months.length - 1)) * (width - pad.l - pad.r));
  const y = (value: number) => pad.t + (1 - (value - min) / (max - min)) * (height - pad.t - pad.b);
  const ticks = [min, min + (max - min) / 2, max];
  const labelEvery = Math.max(1, Math.ceil(months.length / 6));

  return (
    <div>
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
        {months.map((month, index) => index % labelEvery === 0 ? (
          <text key={month} x={x(index)} y={height - 8} textAnchor="middle" fontSize="11" fill="#78716c">{month}</text>
        ) : null)}
      </svg>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
          {series.map((line) => (
            <span key={line.name} className="text-xs text-zinc-600 inline-flex items-center gap-1">
              <span className="inline-block w-3 h-1.5 rounded" style={{ background: line.color }} />
              {line.name}
            </span>
          ))}
        </div>
      )}
    </div>
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

function BarChart({ bars }: { bars: { label: string; value: number }[] }): ReactElement {
  const rows = bars.filter((bar) => bar.value > 0);
  if (rows.length === 0) return <p className="text-sm text-zinc-500">No spend in this range.</p>;
  const width = 720;
  const height = Math.max(180, rows.length * 28 + 16);
  const pad = { l: 110, r: 64, t: 8, b: 8 };
  const max = Math.max(...rows.map((bar) => bar.value));
  const inner = width - pad.l - pad.r;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img">
      {rows.map((bar, index) => {
        const y = pad.t + index * 28;
        const barWidth = (bar.value / max) * inner;
        return (
          <g key={bar.label}>
            <text x={pad.l - 8} y={y + 14} textAnchor="end" fontSize="11" fill="#44403c">{bar.label}</text>
            <rect x={pad.l} y={y + 4} width={Math.max(barWidth, 1)} height={16} fill="#1e4d3a" rx="2" />
            <text x={pad.l + barWidth + 6} y={y + 16} fontSize="11" fill="#57534e">{compact(bar.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function fmt(value: number | null, digits: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function money(value: number, currency: string): string {
  return `${currency} ${fmt(value, 0)}`;
}

function spread(stdev: number | null, count: number, unit: string): string {
  if (stdev == null) return count ? `${count} vehicle` : "Not enough history";
  return `σ ${fmt(stdev, 0)} ${unit} · n=${count}`;
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}
