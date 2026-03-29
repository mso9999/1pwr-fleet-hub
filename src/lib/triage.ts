/**
 * Triage scoring per specifications.md §9 (HQ vs 3rd party).
 * Weights: parts 25%, urgency 25%, HQ skill match 25%, days waiting 25%.
 */

export type TriageBand = "keep-hq" | "review" | "recommend-3rd-party";

export interface TriageFactors {
  partsReady: number;
  operationalUrgency: number;
  hqSkillMatch: number;
  daysWaiting: number;
}

export interface TriageRow {
  workOrderId: string;
  vehicleCode: string;
  title: string;
  status: string;
  priority: string;
  repairLocation: string;
  assignedTo: string;
  assetClass: string;
  vehicleStatus: string;
  daysWaiting: number;
  score: number;
  band: TriageBand;
  factors: TriageFactors;
  notes: string;
}

const SPECIALIST_RE =
  /\b(ecu|sensor|throttle|auto\s*elect|electrician|germiston|injection|immobilizer|diagnostic|software)\b/i;
const HEAVY_RE =
  /\b(crane|2628|engine\s*rebuild|overhaul|crankshaft|radiator|heavy|telehandler|welding|fabricat)\b/i;
const HEAVY_ASSET = /heavy-vehicle|equipment/;

export function scorePartsReady(
  partRows: Array<{ pr_status: string }>
): { score: number; notes: string } {
  if (!partRows.length) {
    return { score: 100, notes: "No parts lines — assume nothing blocking" };
  }
  const statuses = partRows.map((p) => (p.pr_status || "").toLowerCase());
  const allReceived = statuses.every((s) => s === "received");
  const anyNeeded = statuses.some((s) => s === "needed");
  if (allReceived) return { score: 100, notes: "All parts received" };
  if (anyNeeded && !statuses.some((s) => s === "received" || s === "ordered")) {
    return { score: 0, notes: "Parts still needed" };
  }
  return { score: 50, notes: "Mixed parts status" };
}

export function scoreOperationalUrgency(vehicleStatus: string, priority: string): { score: number; notes: string } {
  const vs = (vehicleStatus || "").toLowerCase();
  if (vs === "deployed") return { score: 100, notes: "Vehicle deployed" };
  if (priority === "critical") return { score: 90, notes: "Critical priority" };
  if (
    vs === "maintenance-hq" ||
    vs === "maintenance-3rdparty" ||
    vs === "awaiting-parts" ||
    vs === "grounded"
  ) {
    return { score: 75, notes: "Vehicle down / in maintenance chain" };
  }
  if (vs === "operational") return { score: 50, notes: "Operational (backup)" };
  return { score: 25, notes: "Other status" };
}

export function scoreHqSkillMatch(
  title: string,
  description: string,
  assetClass: string
): { score: number; notes: string } {
  const text = `${title}\n${description}`;
  if (SPECIALIST_RE.test(text)) {
    return { score: 0, notes: "Specialist / auto-electrical work — consider 3rd party" };
  }
  if (HEAVY_RE.test(text) || HEAVY_ASSET.test(assetClass || "")) {
    return { score: 100, notes: "Heavy / HQ-specialty work — prefer HQ" };
  }
  return { score: 50, notes: "Standard mechanical" };
}

export function scoreDaysWaiting(days: number): { score: number; notes: string } {
  if (days <= 2) return { score: 100, notes: "0–2 days in queue" };
  if (days <= 5) return { score: 50, notes: "3–5 days waiting" };
  return { score: 0, notes: "5+ days waiting" };
}

export function bandFromScore(score: number): TriageBand {
  if (score > 70) return "keep-hq";
  if (score >= 40) return "review";
  return "recommend-3rd-party";
}

export function computeTriageScore(factors: TriageFactors): number {
  return Math.round(
    factors.partsReady * 0.25 +
      factors.operationalUrgency * 0.25 +
      factors.hqSkillMatch * 0.25 +
      factors.daysWaiting * 0.25
  );
}
