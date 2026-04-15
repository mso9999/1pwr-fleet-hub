import profiles from "@/data/vehicle-fuel-profiles.json";

export interface FuelProfileRow {
  make: string;
  model: string;
  yearMin: number;
  yearMax: number;
  lPer100km: number;
  note: string;
}

const rows = profiles as FuelProfileRow[];

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function modelMatches(userModel: string, profileModel: string): boolean {
  const u = norm(userModel);
  const p = norm(profileModel);
  if (!u || !p) return false;
  return u.includes(p) || p.includes(u);
}

/**
 * Returns typical combined fuel use (L/100 km) from curated table (public data / manufacturer figures).
 */
export function suggestFuelLPer100km(make: string, model: string, year: number | null): {
  lPer100km: number;
  note: string;
} | null {
  const mk = norm(make);
  const md = norm(model);
  const y = year && year > 1950 ? year : new Date().getFullYear();

  const byMake = rows.filter((r) => r.make !== "default" && norm(r.make) === mk);
  const byMakeYear = byMake.filter((r) => y >= r.yearMin && y <= r.yearMax);

  const exact = byMakeYear.filter((r) => md && modelMatches(md, r.model));
  if (exact.length > 0) {
    const pick = exact.sort((a, b) => a.lPer100km - b.lPer100km)[0];
    return { lPer100km: pick.lPer100km, note: pick.note };
  }

  if (byMakeYear.length > 0 && md) {
    const partial = byMakeYear.filter((r) => md.includes(norm(r.model)) || norm(r.model).includes(md));
    if (partial.length > 0) {
      const pick = partial[0];
      return { lPer100km: pick.lPer100km, note: pick.note };
    }
  }

  if (byMakeYear.length > 0) {
    const avg = byMakeYear.reduce((s, r) => s + r.lPer100km, 0) / byMakeYear.length;
    return { lPer100km: Math.round(avg * 10) / 10, note: `Average for ${make} in reference table` };
  }

  const fallback = rows.find((r) => r.make === "default");
  if (fallback) {
    return { lPer100km: fallback.lPer100km, note: fallback.note };
  }
  return null;
}

/** US MPG (combined) from L/100 km */
export function lPer100kmToUsMpg(l: number): number {
  if (l <= 0) return 0;
  return Math.round((235.214583 / l) * 10) / 10;
}

export function litersForDistanceKm(distanceKm: number, lPer100km: number): number {
  if (distanceKm <= 0 || lPer100km <= 0) return 0;
  return Math.round(distanceKm * (lPer100km / 100) * 100) / 100;
}
