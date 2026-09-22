"use client";

import type { ReactElement } from "react";

export type ChartSeries = {
  name: string;
  color: string;
  values: (number | null)[];
  /** Dashed stroke (used for repair overlay). */
  dashed?: boolean;
  /** Which axis: left (default) or right. */
  axis?: "left" | "right";
};

/**
 * Dual-axis line chart: left = odometer (km), right = cumulative repair spend.
 */
export function DualAxisLineChart({
  months,
  left,
  right,
  rightLabel,
}: {
  months: string[];
  left: ChartSeries[];
  right: ChartSeries[];
  rightLabel: string;
}): ReactElement {
  const leftNums = left.flatMap((line) => line.values.filter((v): v is number => v != null));
  const rightNums = right.flatMap((line) => line.values.filter((v): v is number => v != null));
  if (months.length === 0 || (leftNums.length === 0 && rightNums.length === 0)) {
    return <p className="text-sm text-zinc-500">No points in this range.</p>;
  }

  const width = 720;
  const height = 280;
  const pad = { l: 64, r: 64, t: 16, b: 32 };
  const leftMin = leftNums.length ? Math.min(...leftNums) : 0;
  const leftMax = leftNums.length ? Math.max(...leftNums, leftMin + 1) : 1;
  const rightMin = 0;
  const rightMax = rightNums.length ? Math.max(...rightNums, 1) : 1;

  const x = (index: number) =>
    pad.l +
    (months.length === 1
      ? (width - pad.l - pad.r) / 2
      : (index / (months.length - 1)) * (width - pad.l - pad.r));
  const yLeft = (value: number) =>
    pad.t + (1 - (value - leftMin) / (leftMax - leftMin)) * (height - pad.t - pad.b);
  const yRight = (value: number) =>
    pad.t + (1 - (value - rightMin) / (rightMax - rightMin)) * (height - pad.t - pad.b);

  const leftTicks = [leftMin, leftMin + (leftMax - leftMin) / 2, leftMax];
  const rightTicks = [rightMin, rightMin + (rightMax - rightMin) / 2, rightMax];
  const labelEvery = Math.max(1, Math.ceil(months.length / 6));
  const allSeries = [
    ...left.map((s) => ({ ...s, axis: "left" as const })),
    ...right.map((s) => ({ ...s, axis: "right" as const, dashed: s.dashed ?? true })),
  ];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img">
        {leftTicks.map((tick) => (
          <g key={`l-${tick}`}>
            <line x1={pad.l} x2={width - pad.r} y1={yLeft(tick)} y2={yLeft(tick)} stroke="#e7e5e4" />
            <text x={pad.l - 8} y={yLeft(tick) + 4} textAnchor="end" fontSize="11" fill="#78716c">
              {compact(tick)}
            </text>
          </g>
        ))}
        {rightNums.length > 0 &&
          rightTicks.map((tick) => (
            <text
              key={`r-${tick}`}
              x={width - pad.r + 8}
              y={yRight(tick) + 4}
              textAnchor="start"
              fontSize="11"
              fill="#1d4ed8"
            >
              {compact(tick)}
            </text>
          ))}
        <text x={12} y={14} fontSize="10" fill="#57534e">
          km
        </text>
        <text x={width - 12} y={14} fontSize="10" fill="#1d4ed8" textAnchor="end">
          {rightLabel}
        </text>
        {allSeries.map((line) => {
          const y = line.axis === "right" ? yRight : yLeft;
          return (
            <path
              key={`${line.axis}-${line.name}`}
              d={linePath(line.values, x, y)}
              fill="none"
              stroke={line.color}
              strokeWidth={line.axis === "right" ? 2 : 2.25}
              strokeDasharray={line.dashed ? "6 4" : undefined}
              opacity={line.axis === "right" ? 0.9 : 1}
            />
          );
        })}
        {months.map((month, index) =>
          index % labelEvery === 0 ? (
            <text key={month} x={x(index)} y={height - 8} textAnchor="middle" fontSize="11" fill="#78716c">
              {month}
            </text>
          ) : null
        )}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {allSeries.map((line) => (
          <span key={`${line.axis}-${line.name}`} className="text-xs text-zinc-600 inline-flex items-center gap-1">
            <span
              className="inline-block w-4 h-0 border-t-2"
              style={{
                borderColor: line.color,
                borderStyle: line.dashed ? "dashed" : "solid",
              }}
            />
            {line.name}
            {line.axis === "right" ? " (repairs)" : " (odo)"}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LineChart({
  months,
  series,
  zero,
}: {
  months: string[];
  series: ChartSeries[];
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
  const x = (index: number) =>
    pad.l +
    (months.length === 1
      ? (width - pad.l - pad.r) / 2
      : (index / (months.length - 1)) * (width - pad.l - pad.r));
  const y = (value: number) => pad.t + (1 - (value - min) / (max - min)) * (height - pad.t - pad.b);
  const ticks = [min, min + (max - min) / 2, max];
  const labelEvery = Math.max(1, Math.ceil(months.length / 6));

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} stroke="#e7e5e4" />
            <text x={pad.l - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#78716c">
              {compact(tick)}
            </text>
          </g>
        ))}
        {series.map((line) => (
          <path
            key={line.name}
            d={linePath(line.values, x, y)}
            fill="none"
            stroke={line.color}
            strokeWidth="2"
            strokeDasharray={line.dashed ? "6 4" : undefined}
          />
        ))}
        {months.map((month, index) =>
          index % labelEvery === 0 ? (
            <text key={month} x={x(index)} y={height - 8} textAnchor="middle" fontSize="11" fill="#78716c">
              {month}
            </text>
          ) : null
        )}
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

function linePath(
  values: (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number
): string {
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

export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}

export function fmt(value: number | null, digits: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}
