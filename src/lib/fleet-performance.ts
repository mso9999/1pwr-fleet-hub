/**
 * Fleet performance maths. Odometer points that break a rising series are
 * dropped until the dashboard-photo review is loaded (EXCLUDE_NON_MONOTONIC).
 * Spend is purchase price plus repairs. Per repair event, chooseRepairAmount
 * takes the larger of WO totals / line items vs linked PR/PO (never sum both).
 * Vehicle-tagged PRs without a WO are added separately by the analytics route.
 */

export const EXCLUDE_NON_MONOTONIC = true;

export type VehicleRow = {
  id: string;
  code: string;
  country: string;
  currency: string;
  year: number | null;
  purchasePrice: number;
  purchaseDate: string | null;
  status: string;
  /** Total work orders on record (for cost-coverage warnings). */
  workOrderCount?: number;
  /** Work orders with a non-zero recorded cost (WO header, PR, PO, or line items). */
  workOrdersWithCost?: number;
};

export type OdoPoint = { vehicleId: string; date: string; km: number };
export type SpendEvent = {
  vehicleId: string;
  date: string;
  amount: number;
  source: "purchase" | "pr" | "work-order";
};
export type DowntimeSpan = { vehicleId: string; start: string; end: string | null };

export type FleetSourceData = {
  asOf: string;
  organizations: { id: string; name: string; country: string; currency: string }[];
  vehicles: VehicleRow[];
  odo: OdoPoint[];
  repairs: SpendEvent[];
  downtime: DowntimeSpan[];
};

export type VehicleMetric = {
  id: string;
  code: string;
  year: number | null;
  ageYears: number | null;
  ageBracket: string;
  latestOdo: number | null;
  odoBracket: string;
  kmGained: number | null;
  kmPerYear: number | null;
  purchasePrice: number;
  repairSpend: number;
  tco: number;
  costPerKm: number | null;
  tcoPerKmYear: number | null;
  downtimeDays: number;
  readingsKept: number;
  readingsExcluded: number;
  workOrderCount: number;
  workOrdersWithCost: number;
};

export type MonthPoint = {
  month: string;
  odo: number | null;
  /** Cumulative purchase + repairs through month end. */
  spend: number;
  /** Cumulative repairs only (no purchase) through month end — for odo overlay. */
  repair: number;
  byVehicle: Record<string, { odo: number | null; spend: number; repair: number }>;
};

export type BracketBar = { label: string; spend: number; vehicles: number };

export type FleetPerformance = {
  excludedNonMonotonic: number;
  readingsKept: number;
  purchasePricesMissing: boolean;
  metrics: VehicleMetric[];
  months: MonthPoint[];
  odoBrackets: BracketBar[];
  ageBrackets: BracketBar[];
  portfolio: {
    vehicleCount: number;
    meanKmPerYear: number | null;
    stdevKmPerYear: number | null;
    meanTcoPerKmYear: number | null;
    stdevTcoPerKmYear: number | null;
    medianTcoPerKmYear: number | null;
    totalTco: number;
    totalPurchase: number;
    totalRepairs: number;
    totalKmGained: number;
    costPerKm: number | null;
    totalDowntimeDays: number;
    ratedVehicles: number;
  };
};

const ODO_STEP = 50_000;
const AGE_STEP = 5;
const MIN_RATE_DAYS = 90;

export function asDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const [, day] = match;
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  return day;
}

export function chooseRepairAmount(
  pr: number,
  po: number,
  total: number,
  lineItems = 0
): { amount: number; source: "pr" | "work-order" } | null {
  // Prefer the larger recorded figure so a thin WO total does not hide a bigger
  // approved PR/PO or parts/labour lines that were never rolled into total_cost.
  const wo = Math.max(total, lineItems);
  const best = Math.max(wo, pr, po);
  if (best <= 0) return null;
  if (wo >= pr && wo >= po) return { amount: wo, source: "work-order" };
  return { amount: best, source: "pr" };
}

/** PR statuses that count as committed vehicle spend in FM analytics. */
export const PR_SPEND_STATUSES = new Set([
  "APPROVED",
  "ORDERED",
  "COMPLETED",
]);

export function isPrSpendStatus(status: string | null | undefined): boolean {
  return PR_SPEND_STATUSES.has(String(status || "").trim().toUpperCase());
}

export function mileageFromInspectionItems(itemsJson: string): number | null {
  let items: unknown;
  try {
    items = JSON.parse(itemsJson);
  } catch {
    return null;
  }
  if (!Array.isArray(items)) return null;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const category = String(row.category ?? "");
    const item = String(row.item ?? "");
    const note = String(row.note ?? "");
    const blob = `${category} ${item}`.toLowerCase();
    if (!blob.includes("mile") && !blob.includes("odo")) continue;
    const noteOnly = note.trim().match(/^\d{2,7}$/);
    if (noteOnly) {
      const n = Number(noteOnly[0]);
      if (n >= 1 && n <= 1_500_000) return n;
    }
    const nums = [...`${item} ${note}`.matchAll(/\d{2,7}/g)]
      .map((m) => Number(m[0]))
      .filter((n) => n >= 1 && n <= 1_500_000);
    if (nums.length >= 1) return nums[0];
  }
  return null;
}

/** Longest non-decreasing run. Equal lengths keep the smaller total rise. */
export function keepMonotonic<T extends { km: number }>(points: T[]): T[] {
  const n = points.length;
  if (n <= 1) return points.slice();
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  const rise = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (points[j].km > points[i].km) continue;
      const nextLen = len[j] + 1;
      const nextRise = rise[j] + (points[i].km - points[j].km);
      if (nextLen > len[i] || (nextLen === len[i] && nextRise < rise[i])) {
        len[i] = nextLen;
        prev[i] = j;
        rise[i] = nextRise;
      }
    }
  }
  let best = 0;
  for (let i = 1; i < n; i++) {
    if (len[i] > len[best] || (len[i] === len[best] && rise[i] < rise[best])) best = i;
  }
  const out: T[] = [];
  for (let i = best; i >= 0; i = prev[i]) out.push(points[i]);
  out.reverse();
  return out;
}

export function sampleStdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, n) => sum + n, 0) / values.length;
  const variance = values.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function odoBracketLabel(km: number): string {
  const lo = Math.floor(km / ODO_STEP) * ODO_STEP;
  return `${formatKm(lo)}–${formatKm(lo + ODO_STEP)}`;
}

export function ageBracketLabel(ageYears: number): string {
  const lo = Math.max(0, Math.floor(ageYears / AGE_STEP) * AGE_STEP);
  return `${lo}–${lo + AGE_STEP} yrs`;
}

function formatKm(km: number): string {
  if (km === 0) return "0";
  if (km % 1000 === 0) return `${km / 1000}k`;
  return String(km);
}

function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

function monthEnd(ym: string): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

function monthsSpan(start: string, end: string): string[] {
  const out: string[] = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (out.length > 600) break;
  }
  return out;
}

function inWindow(date: string, from: string | null, to: string | null): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function displayCode(vehicle: VehicleRow, vehicles: VehicleRow[]): string {
  const duplicated = vehicles.some((other) => other.id !== vehicle.id && other.code === vehicle.code);
  return duplicated ? `${vehicle.code} (${vehicle.country})` : vehicle.code;
}

function lastOnOrBefore<T extends { date: string }>(points: T[], day: string): T | null {
  let found: T | null = null;
  for (const point of points) {
    if (point.date <= day) found = point;
    else break;
  }
  return found;
}

export function buildFleetPerformance(input: {
  vehicles: VehicleRow[];
  odo: OdoPoint[];
  repairs: SpendEvent[];
  downtime: DowntimeSpan[];
  from: string | null;
  to: string | null;
  asOf: string;
}): FleetPerformance {
  const from = asDay(input.from);
  const to = asDay(input.to);
  const asOf = asDay(input.asOf) ?? "1970-01-01";
  const ids = new Set(input.vehicles.map((v) => v.id));
  const label = new Map(input.vehicles.map((v) => [v.id, displayCode(v, input.vehicles)]));

  const keptById = new Map<string, OdoPoint[]>();
  const excludedById = new Map<string, number>();
  let excludedNonMonotonic = 0;
  let readingsKept = 0;

  const grouped = new Map<string, OdoPoint[]>();
  for (const point of input.odo) {
    const date = asDay(point.date);
    if (!ids.has(point.vehicleId) || !date || point.km < 1 || point.km > 1_500_000) continue;
    const list = grouped.get(point.vehicleId) ?? [];
    list.push({ ...point, date });
    grouped.set(point.vehicleId, list);
  }

  for (const [vehicleId, points] of grouped) {
    points.sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
    const deduped: OdoPoint[] = [];
    for (const point of points) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.date === point.date && prev.km === point.km) continue;
      deduped.push(point);
    }
    const kept = EXCLUDE_NON_MONOTONIC ? keepMonotonic(deduped) : deduped;
    const excluded = deduped.length - kept.length;
    excludedNonMonotonic += excluded;
    readingsKept += kept.length;
    keptById.set(vehicleId, kept);
    excludedById.set(vehicleId, excluded);
  }

  const allTime = !from && !to;
  const spendById = new Map<string, SpendEvent[]>();
  const pushSpend = (event: SpendEvent) => {
    const date = asDay(event.date);
    if (!ids.has(event.vehicleId) || !date || event.amount <= 0) return;
    if (!inWindow(date, from, to)) return;
    const list = spendById.get(event.vehicleId) ?? [];
    list.push({ ...event, date });
    spendById.set(event.vehicleId, list);
  };
  for (const event of input.repairs) pushSpend(event);

  let purchasePricesMissing = true;
  for (const vehicle of input.vehicles) {
    if (vehicle.purchasePrice > 0) purchasePricesMissing = false;
    if (vehicle.purchasePrice <= 0) continue;
    const dated = asDay(vehicle.purchaseDate);
    if (dated) {
      pushSpend({ vehicleId: vehicle.id, date: dated, amount: vehicle.purchasePrice, source: "purchase" });
    } else if (allTime && vehicle.year && vehicle.year >= 1970 && vehicle.year <= Number(asOf.slice(0, 4))) {
      pushSpend({
        vehicleId: vehicle.id,
        date: `${vehicle.year}-01-01`,
        amount: vehicle.purchasePrice,
        source: "purchase",
      });
    }
  }

  const windowEnd = to ?? asOf;
  const metrics: VehicleMetric[] = input.vehicles.map((vehicle) => {
    const kept = keptById.get(vehicle.id) ?? [];
    const visible = kept.filter((point) => !to || point.date <= to);
    const inRange = visible.filter((point) => !from || point.date >= from);
    const baseline = from ? [...visible].reverse().find((point) => point.date < from) ?? null : null;
    const latest = visible[visible.length - 1] ?? null;
    const startPoint = baseline ?? inRange[0] ?? null;
    const endPoint = inRange[inRange.length - 1] ?? baseline;
    const kmGained = startPoint && endPoint ? endPoint.km - startPoint.km : null;
    const spanDays = startPoint && endPoint ? daysBetween(startPoint.date, endPoint.date) : 0;
    const kmPerYear = kmGained != null && spanDays >= MIN_RATE_DAYS ? kmGained / (spanDays / 365.25) : null;
    const events = spendById.get(vehicle.id) ?? [];
    const purchasePrice = events.filter((event) => event.source === "purchase").reduce((sum, event) => sum + event.amount, 0);
    const repairSpend = events.filter((event) => event.source !== "purchase").reduce((sum, event) => sum + event.amount, 0);
    const tco = purchasePrice + repairSpend;
    const ageYears = vehicle.year && vehicle.year >= 1970 ? Number(asOf.slice(0, 4)) - vehicle.year : null;
    const downtimeDays = downtimeInWindow(input.downtime, vehicle.id, from, windowEnd);
    const rawCount = kept.length + (excludedById.get(vehicle.id) ?? 0);
    return {
      id: vehicle.id,
      code: label.get(vehicle.id) ?? vehicle.code,
      year: vehicle.year,
      ageYears,
      ageBracket: ageYears == null ? "Age unknown" : ageBracketLabel(ageYears),
      latestOdo: latest?.km ?? null,
      odoBracket: latest ? odoBracketLabel(latest.km) : "No odometer",
      kmGained,
      kmPerYear,
      purchasePrice,
      repairSpend,
      tco,
      costPerKm: latest && latest.km > 0 && tco > 0 ? tco / latest.km : null,
      tcoPerKmYear: tco > 0 && kmPerYear != null && kmPerYear > 0 ? tco / kmPerYear : null,
      downtimeDays,
      readingsKept: kept.length,
      readingsExcluded: Math.max(0, rawCount - kept.length),
      workOrderCount: vehicle.workOrderCount ?? 0,
      workOrdersWithCost: vehicle.workOrdersWithCost ?? 0,
    };
  });

  const months = buildMonths(input.vehicles, keptById, spendById, from, to, label);
  const odoBrackets = bracketSpend(metrics, (metric) => metric.odoBracket, odoBracketOrder);
  const ageBrackets = bracketSpend(metrics, (metric) => metric.ageBracket, ageBracketOrder);

  const rates = metrics.map((metric) => metric.kmPerYear).filter((n): n is number => n != null);
  const ratios = metrics.map((metric) => metric.tcoPerKmYear).filter((n): n is number => n != null);
  const totalTco = metrics.reduce((sum, metric) => sum + metric.tco, 0);
  const totalKmGained = metrics.reduce((sum, metric) => sum + (metric.kmGained ?? 0), 0);
  const odoOnClock = metrics.reduce((sum, metric) => sum + (metric.latestOdo ?? 0), 0);

  return {
    excludedNonMonotonic,
    readingsKept,
    purchasePricesMissing,
    metrics,
    months,
    odoBrackets,
    ageBrackets,
    portfolio: {
      vehicleCount: metrics.length,
      meanKmPerYear: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
      stdevKmPerYear: sampleStdDev(rates),
      meanTcoPerKmYear: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null,
      stdevTcoPerKmYear: sampleStdDev(ratios),
      medianTcoPerKmYear: median(ratios),
      totalTco,
      totalPurchase: metrics.reduce((sum, metric) => sum + metric.purchasePrice, 0),
      totalRepairs: metrics.reduce((sum, metric) => sum + metric.repairSpend, 0),
      totalKmGained,
      costPerKm: odoOnClock > 0 && totalTco > 0 ? totalTco / odoOnClock : null,
      totalDowntimeDays: metrics.reduce((sum, metric) => sum + metric.downtimeDays, 0),
      ratedVehicles: ratios.length,
    },
  };
}

function downtimeInWindow(spans: DowntimeSpan[], vehicleId: string, from: string | null, windowEnd: string): number {
  const clips: Array<[number, number]> = [];
  for (const span of spans) {
    if (span.vehicleId !== vehicleId) continue;
    const start = asDay(span.start);
    if (!start) continue;
    const end = asDay(span.end) ?? windowEnd;
    const clipStart = from && from > start ? from : start;
    const clipEnd = end < windowEnd ? end : windowEnd;
    if (clipEnd <= clipStart) continue;
    const startMs = Date.parse(`${clipStart}T00:00:00Z`);
    const endMs = Date.parse(`${clipEnd}T00:00:00Z`);
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) clips.push([startMs, endMs]);
  }
  clips.sort((a, b) => a[0] - b[0]);
  let days = 0;
  let openStart = -1;
  let openEnd = -1;
  for (const [startMs, endMs] of clips) {
    if (openEnd < 0 || startMs > openEnd) {
      if (openEnd >= 0) days += openEnd - openStart;
      openStart = startMs;
      openEnd = endMs;
    } else if (endMs > openEnd) {
      openEnd = endMs;
    }
  }
  if (openEnd >= 0) days += openEnd - openStart;
  return Math.round(days / 86400000);
}

function buildMonths(
  vehicles: VehicleRow[],
  keptById: Map<string, OdoPoint[]>,
  spendById: Map<string, SpendEvent[]>,
  from: string | null,
  to: string | null,
  label: Map<string, string>
): MonthPoint[] {
  const dates: string[] = [];
  for (const points of keptById.values()) {
    for (const point of points) if (inWindow(point.date, from, to)) dates.push(point.date);
  }
  for (const events of spendById.values()) {
    for (const event of events) dates.push(event.date);
  }
  if (dates.length === 0) return [];
  dates.sort();
  const start = from ?? dates[0];
  const end = to ?? dates[dates.length - 1];
  const months = monthsSpan(start.slice(0, 7), end.slice(0, 7));
  return months.map((month) => {
    const endDay = monthEnd(month);
    const byVehicle: MonthPoint["byVehicle"] = {};
    let odoSum = 0;
    let odoCount = 0;
    let spendSum = 0;
    let repairSum = 0;
    for (const vehicle of vehicles) {
      const code = label.get(vehicle.id) ?? vehicle.code;
      const cap = to && to < endDay ? to : endDay;
      const reading = lastOnOrBefore(keptById.get(vehicle.id) ?? [], cap);
      const visibleOdo = reading ? reading.km : null;
      const events = spendById.get(vehicle.id) ?? [];
      const spend = events.filter((event) => event.date <= endDay).reduce((sum, event) => sum + event.amount, 0);
      const repair = events
        .filter((event) => event.date <= endDay && event.source !== "purchase")
        .reduce((sum, event) => sum + event.amount, 0);
      byVehicle[code] = { odo: visibleOdo, spend, repair };
      if (visibleOdo != null) {
        odoSum += visibleOdo;
        odoCount += 1;
      }
      spendSum += spend;
      repairSum += repair;
    }
    return { month, odo: odoCount ? odoSum : null, spend: spendSum, repair: repairSum, byVehicle };
  });
}

function bracketSpend(
  metrics: VehicleMetric[],
  key: (metric: VehicleMetric) => string,
  order: (label: string) => number
): BracketBar[] {
  const map = new Map<string, BracketBar>();
  for (const metric of metrics) {
    if (metric.tco <= 0 && metric.repairSpend <= 0 && metric.purchasePrice <= 0) continue;
    const label = key(metric);
    const bar = map.get(label) ?? { label, spend: 0, vehicles: 0 };
    bar.spend += metric.tco;
    bar.vehicles += 1;
    map.set(label, bar);
  }
  return [...map.values()].sort((a, b) => order(a.label) - order(b.label));
}

function odoBracketOrder(label: string): number {
  if (label === "No odometer") return 1_000_000;
  const n = Number.parseFloat(label);
  return Number.isFinite(n) ? n : 999_999;
}

function ageBracketOrder(label: string): number {
  if (label === "Age unknown") return 1_000;
  const n = Number.parseInt(label, 10);
  return Number.isFinite(n) ? n : 999;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
