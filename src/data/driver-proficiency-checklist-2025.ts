/**
 * 1PWR Vehicle Inspection Checklist (2025) — sourced from
 * Driver Proficiency Project / 1PWR Vehicle Inspection Checklist_2025.xlsx
 * (paired left/right columns as in the spreadsheet).
 */

export interface ChecklistCell {
  section: string;
  item: string;
  hint?: string;
}

export interface ChecklistPairedRow {
  left: ChecklistCell | null;
  right: ChecklistCell | null;
}

/** Paired rows matching the Excel layout (tablet UI shows two columns per row when both sides exist). */
export const DRIVER_PROFICIENCY_PAIRED_ROWS: ChecklistPairedRow[] = [
  { left: { section: "Wheels", item: "Tyre tread", hint: "Minimum 1mm" }, right: { section: "Suspension", item: "Shock absorbers" } },
  { left: { section: "Wheels", item: "Rims" }, right: { section: "Suspension", item: "CV joints" } },
  { left: { section: "Wheels", item: "Spare", hint: "Yes/No" }, right: { section: "Suspension", item: "Wheel bearings" } },
  { left: { section: "Wheels", item: "All wheel nuts in place" }, right: { section: "Suspension", item: "Control arm bushes" } },
  { left: { section: "Wheels", item: "Wheel nuts torque 100 – 115 N·m" }, right: { section: "Suspension", item: "Ball joints condition" } },
  { left: { section: "Glass", item: "Windscreen" }, right: { section: "Suspension", item: "Wheel alignment" } },
  { left: { section: "Glass", item: "Windows" }, right: { section: "Transmission", item: "Fluid leaks", hint: "Yes/No" } },
  { left: { section: "Glass", item: "Mirrors" }, right: { section: "Transmission", item: "Gear shift" } },
  { left: { section: "Glass", item: "Wiper blades" }, right: { section: "Transmission", item: "4WD / 2WD" } },
  { left: { section: "Lights", item: "Head lights" }, right: { section: "Transmission", item: "Prop shaft bearings and yokes" } },
  { left: { section: "Lights", item: "Reverse lights" }, right: { section: "Road test", item: "Unusual sound" } },
  { left: { section: "Lights", item: "Indicators" }, right: { section: "Road test", item: "Unusual vibration" } },
  { left: { section: "Lights", item: "Hazards" }, right: { section: "Road test", item: "Brakes" } },
  { left: { section: "Lights", item: "Running lights" }, right: { section: "Road test", item: "Steering tracks and no play" } },
  { left: { section: "Lights", item: "Brake lights" }, right: { section: "Fluid levels", item: "Radiator" } },
  { left: { section: "Lights", item: "Numberplate light" }, right: { section: "Fluid levels", item: "Engine oil" } },
  { left: { section: "Lights", item: "Interior lights" }, right: { section: "Fluid levels", item: "Power steering fluid" } },
  { left: { section: "Engine", item: "Fluid leaks", hint: "Yes/No" }, right: { section: "Fluid levels", item: "Gearbox oil" } },
  { left: { section: "Engine", item: "Corrosion" }, right: { section: "Fluid levels", item: "Diff oil" } },
  { left: { section: "Engine", item: "Mounts" }, right: { section: "Body", item: "Bonnet opening and closing" } },
  { left: { section: "Engine", item: "Idle / hard start" }, right: { section: "Body", item: "Tailgate opening and closing" } },
  { left: { section: "Engine", item: "Dashboard warning lights" }, right: { section: "Body", item: "Towing points front and rear" } },
  { left: { section: "Engine", item: "Alternator voltage reading" }, right: { section: "Body", item: "All doors properly functioning" } },
  { left: { section: "Engine", item: "Engine mountings" }, right: { section: "Body", item: "(Mark damage with X)" } },
  { left: { section: "Engine", item: "Gearbox mountings" }, right: null },
  { left: { section: "Electrical", item: "Speedo / ODO" }, right: null },
  { left: { section: "Electrical", item: "Tach" }, right: null },
  { left: { section: "Electrical", item: "Battery voltage and terminals condition" }, right: null },
  { left: { section: "Electrical", item: "Indicators" }, right: null },
  { left: { section: "Electrical", item: "Voltage" }, right: null },
  { left: { section: "Electrical", item: "Coolant temp" }, right: null },
  { left: { section: "Electrical", item: "Hooter" }, right: null },
  { left: { section: "Electrical", item: "Central locking" }, right: null },
  { left: { section: "Electrical", item: "Windows" }, right: null },
  { left: { section: "Electrical", item: "Wiper motor" }, right: null },
  { left: { section: "Electrical", item: "Audio" }, right: null },
  { left: { section: "Interior", item: "Upholstery" }, right: null },
  { left: { section: "Interior", item: "Seat adjustment" }, right: null },
  { left: { section: "Interior", item: "12V socket" }, right: null },
  { left: { section: "Interior", item: "All seatbelts operational" }, right: null },
  { left: { section: "Tools", item: "Jack" }, right: null },
  { left: { section: "Tools", item: "Wheel spanner" }, right: null },
  { left: { section: "Tools", item: "Triangle" }, right: null },
  { left: { section: "Tools", item: "Spare key" }, right: null },
];

function formatCell(c: ChecklistCell): string {
  return c.hint ? `${c.item} (${c.hint})` : c.item;
}

/** Flat list for API payloads (category + item strings). Order matches paired rows: left then right per row. */
export function flattenDriverProficiencyItems(): Array<{ category: string; item: string }> {
  const out: Array<{ category: string; item: string }> = [];
  for (const row of DRIVER_PROFICIENCY_PAIRED_ROWS) {
    if (row.left) out.push({ category: row.left.section, item: formatCell(row.left) });
    if (row.right) out.push({ category: row.right.section, item: formatCell(row.right) });
  }
  return out;
}

/** Maps flat index → paired row index and side for UI lookup. */
export function flatIndexMeta(): Array<{ row: number; side: "left" | "right" }> {
  const meta: Array<{ row: number; side: "left" | "right" }> = [];
  DRIVER_PROFICIENCY_PAIRED_ROWS.forEach((pair, row) => {
    if (pair.left) meta.push({ row, side: "left" });
    if (pair.right) meta.push({ row, side: "right" });
  });
  return meta;
}

export const DRIVER_PROFICIENCY_FLAT_TEMPLATE = flattenDriverProficiencyItems();

/** Maps each paired row to flat array indices for ratings[]. */
export function getFlatIndicesPerRow(): Array<{ leftIdx: number | null; rightIdx: number | null }> {
  let i = 0;
  return DRIVER_PROFICIENCY_PAIRED_ROWS.map((pair) => {
    const leftIdx = pair.left ? i++ : null;
    const rightIdx = pair.right ? i++ : null;
    return { leftIdx, rightIdx };
  });
}
