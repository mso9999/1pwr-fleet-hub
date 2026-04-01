/** Stored on an inspection line item when the row uses the body plan view. */
export interface BodyMark {
  xPct: number;
  yPct: number;
  note: string;
}

export function isBodyPlanRow(category: string, item: string): boolean {
  const i = item.toLowerCase();
  if (i.includes("(mark damage with x)")) return true;
  if (i.includes("mark damage with x")) return true;
  return category === "Exterior" && i.includes("body damage");
}

export function parseBodyMarks(raw: unknown): BodyMark[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: BodyMark[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return undefined;
    const o = m as Record<string, unknown>;
    const xPct = typeof o.xPct === "number" ? o.xPct : Number.NaN;
    const yPct = typeof o.yPct === "number" ? o.yPct : Number.NaN;
    const note = typeof o.note === "string" ? o.note : "";
    if (!Number.isFinite(xPct) || xPct < 0 || xPct > 100) return undefined;
    if (!Number.isFinite(yPct) || yPct < 0 || yPct > 220) return undefined;
    out.push({ xPct, yPct, note });
  }
  return out;
}
