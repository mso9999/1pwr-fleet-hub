"use client";

import { useCallback, useId, useRef } from "react";
import type { BodyMark } from "@/lib/inspection-body-diagram";

interface Props {
  marks: BodyMark[];
  onChange: (marks: BodyMark[]) => void;
  readOnly?: boolean;
  className?: string;
}

/**
 * Top-down vehicle plan (line drawing). Tap to place an X; add a short note per mark.
 * Coordinates stored as 0–100% of the diagram box for responsive replay.
 */
export function VehicleBodyDiagram({ marks, onChange, readOnly, className }: Props): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useId();

  const addMark = useCallback(
    (xPct: number, yPct: number) => {
      if (readOnly) return;
      onChange([...marks, { xPct, yPct, note: "" }]);
    },
    [marks, onChange, readOnly]
  );

  const updateMarkNote = useCallback(
    (index: number, note: string) => {
      if (readOnly) return;
      const next = marks.map((m, i) => (i === index ? { ...m, note } : m));
      onChange(next);
    },
    [marks, onChange, readOnly]
  );

  const removeMark = useCallback(
    (index: number) => {
      if (readOnly) return;
      onChange(marks.filter((_, i) => i !== index));
    },
    [marks, onChange, readOnly]
  );

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>): void {
    if (readOnly) return;
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return;
    addMark(Math.round(xPct * 10) / 10, Math.round(yPct * 10) / 10);
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-semibold text-zinc-800">Body — plan view (top)</div>
          <p className="text-xs text-zinc-500">
            {readOnly
              ? "Damage marks as recorded."
              : "Tap the drawing to place an X. Add a short note for each mark (recommended). Use line note or photos for Fail as well."}
          </p>
        </div>
      </div>

      <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-2 sm:p-3">
        <svg
          ref={svgRef}
          viewBox="0 0 100 220"
          className={`w-full max-h-[min(420px,55vh)] aspect-[100/220] ${readOnly ? "" : "cursor-crosshair"}`}
          onClick={handleSvgClick}
          role="img"
          aria-labelledby={`${uid}-title`}
        >
          <title id={`${uid}-title`}>Vehicle top-down diagram for marking body damage</title>
          <defs>
            <pattern id={`${uid}-grid`} width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#cbd5e1" strokeWidth="0.15" />
            </pattern>
          </defs>
          <rect width="100" height="220" fill={`url(#${uid}-grid)`} className="text-slate-200" />
          {/* Bonnet */}
          <ellipse cx="50" cy="28" rx="22" ry="18" fill="#f1f5f9" stroke="#64748b" strokeWidth="0.8" />
          <text x="50" y="32" textAnchor="middle" className="fill-zinc-400 text-[5px] font-medium" style={{ fontSize: "5px" }}>
            FRONT
          </text>
          {/* Cabin / roof */}
          <rect x="28" y="46" width="44" height="72" rx="6" fill="#e2e8f0" stroke="#64748b" strokeWidth="0.8" />
          {/* Windscreen line */}
          <line x1="32" y1="52" x2="68" y2="52" stroke="#94a3b8" strokeWidth="0.5" />
          {/* Rear cabin */}
          <rect x="30" y="118" width="40" height="52" rx="5" fill="#e2e8f0" stroke="#64748b" strokeWidth="0.8" />
          {/* Load bed (pickup-style) */}
          <rect x="26" y="168" width="48" height="38" rx="4" fill="#f1f5f9" stroke="#64748b" strokeWidth="0.8" />
          <text x="50" y="188" textAnchor="middle" className="fill-zinc-400" style={{ fontSize: "4.5px" }}>
            REAR
          </text>
          {/* Wheels (corners) */}
          <rect x="8" y="58" width="14" height="22" rx="3" fill="#334155" stroke="#0f172a" strokeWidth="0.5" />
          <rect x="78" y="58" width="14" height="22" rx="3" fill="#334155" stroke="#0f172a" strokeWidth="0.5" />
          <rect x="8" y="132" width="14" height="22" rx="3" fill="#334155" stroke="#0f172a" strokeWidth="0.5" />
          <rect x="78" y="132" width="14" height="22" rx="3" fill="#334155" stroke="#0f172a" strokeWidth="0.5" />
          {/* Mirror hints */}
          <line x1="22" y1="70" x2="14" y2="68" stroke="#64748b" strokeWidth="0.4" />
          <line x1="78" y1="70" x2="86" y2="68" stroke="#64748b" strokeWidth="0.4" />

          {marks.map((m, i) => (
            <g
              key={i}
              transform={`translate(${m.xPct}, ${(m.yPct / 100) * 220})`}
              style={{ pointerEvents: "none" }}
            >
              <line x1="-3" y1="-3" x2="3" y2="3" stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="3" y1="-3" x2="-3" y2="3" stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          ))}
        </svg>
      </div>

      {!readOnly && marks.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-semibold text-zinc-600">Marks ({marks.length})</div>
          {marks.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2">
              <span className="text-xs text-zinc-500 w-16 shrink-0">#{i + 1}</span>
              <input
                type="text"
                value={m.note}
                onChange={(e) => updateMarkNote(i, e.target.value)}
                placeholder="Note (e.g. dent L rear door)"
                className="flex-1 min-w-[160px] h-9 rounded-md border border-zinc-200 px-2 text-sm"
              />
              <button
                type="button"
                onClick={() => removeMark(i)}
                className="text-xs text-red-600 hover:underline px-2 py-1"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {readOnly && marks.length > 0 && (
        <ul className="mt-2 text-sm text-zinc-700 space-y-1">
          {marks.map((m, i) => (
            <li key={i}>
              <span className="font-medium text-zinc-500">#{i + 1}</span>{" "}
              {m.note.trim() || <span className="text-zinc-400">(no note)</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
