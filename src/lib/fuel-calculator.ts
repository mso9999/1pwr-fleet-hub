/**
 * Excel-aligned travel fuel budget math.
 *
 * Source: 1PWR Travel Fuel Budget Estimator Template.xlsx Sheet1
 *   C8 = C4/C6  litres
 *   C9 = C8*C5  cost
 *   C12 = C10*C9 budget (safety factor multiplies money, not distance)
 */

export const DEFAULT_FUEL_SAFETY_FACTOR = 2;
/** Straight-line × this when OSRM has no route for a leg. Not the money safety factor. */
export const ROAD_FALLBACK_FACTOR = 1.4;

export type FuelDisposition = "" | "pr_requested" | "in_deployment_budget";

export function lPer100ToKmPerL(lPer100km: number): number {
  if (!(lPer100km > 0)) return 0;
  return 100 / lPer100km;
}

export function kmPerLToLPer100(kmPerL: number): number {
  if (!(kmPerL > 0)) return 0;
  return 100 / kmPerL;
}

export type FuelBudgetInputs = {
  distanceKm: number;
  /** Economy as km per litre (Excel C6). */
  kmPerLitre: number;
  pumpPricePerLitre: number;
  safetyFactor: number;
};

export type FuelBudgetResult = {
  litres: number;
  cost: number;
  budget: number;
  distanceKm: number;
  kmPerLitre: number;
  lPer100km: number;
  pumpPricePerLitre: number;
  safetyFactor: number;
};

/** Round money/litres to 2 dp (Excel-style). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure calculator. Worked check: 100 km, 20/L, 10 km/L, factor 2 → 10 L, cost 200, budget 400.
 */
export function calculateFuelBudget(input: FuelBudgetInputs): FuelBudgetResult {
  const distanceKm = Number(input.distanceKm) || 0;
  const kmPerLitre = Number(input.kmPerLitre) || 0;
  const pumpPricePerLitre = Number(input.pumpPricePerLitre) || 0;
  const safetyFactor = Number(input.safetyFactor);
  const factor = Number.isFinite(safetyFactor) && safetyFactor > 0 ? safetyFactor : DEFAULT_FUEL_SAFETY_FACTOR;

  const litres = kmPerLitre > 0 && distanceKm > 0 ? distanceKm / kmPerLitre : 0;
  const cost = litres * pumpPricePerLitre;
  const budget = cost * factor;

  return {
    litres: round2(litres),
    cost: round2(cost),
    budget: round2(budget),
    distanceKm: round2(distanceKm),
    kmPerLitre: round2(kmPerLitre),
    lPer100km: round2(kmPerLToLPer100(kmPerLitre)),
    pumpPricePerLitre: round2(pumpPricePerLitre),
    safetyFactor: factor,
  };
}

export function defaultFuelCurrencyForOrg(organizationId: string): string {
  if (organizationId === "1pwr_benin") return "XOF";
  if (organizationId === "1pwr_lesotho") return "LSL";
  return "LSL";
}

export function normalizeFuelDisposition(raw: unknown): FuelDisposition {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "pr_requested" || s === "in_deployment_budget") return s;
  return "";
}
