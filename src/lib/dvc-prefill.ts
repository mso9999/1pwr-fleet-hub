/**
 * Client-side prefill rules for the Driver Vehicle Check form: carrying defects over from the
 * vehicle's last check (each must be confirmed as still present or fixed) and the wording of
 * the "prefilled" markers. Pure module (no db import) so the form and test scripts share it.
 */
import type { PreviousDefect } from "@/lib/vehicle-check-context";

export type PassFail = "pass" | "fail";
export type YesNo = 1 | 0;
export type CarriedDecision = "pending" | "present" | "fixed";

export interface CarriedDefect extends PreviousDefect {
  decision: CarriedDecision;
}

export interface DvcItemState {
  statusRatings: Record<string, PassFail>;
  equipChecks: Record<string, YesNo>;
  failureDescs: Record<string, string>;
  /** Defects carried from the last check, keyed by form key. */
  carried: Record<string, CarriedDefect>;
}

export const EMPTY_ITEM_STATE: DvcItemState = { statusRatings: {}, equipChecks: {}, failureDescs: {}, carried: {} };

function isDefective(state: DvcItemState, kind: PreviousDefect["kind"], key: string): boolean {
  return kind === "status" ? state.statusRatings[key] === "fail" : state.equipChecks[key] === 0;
}

function setDefective(state: DvcItemState, kind: PreviousDefect["kind"], key: string, defective: boolean): void {
  if (kind === "status") state.statusRatings = { ...state.statusRatings, [key]: defective ? "fail" : "pass" };
  else state.equipChecks = { ...state.equipChecks, [key]: defective ? 0 : 1 };
}

function dropCarriedDescription(state: DvcItemState, d: CarriedDefect): void {
  if (d.description && state.failureDescs[d.key] === d.description) {
    const next = { ...state.failureDescs };
    delete next[d.key];
    state.failureDescs = next;
  }
}

/**
 * Replaces the carried-over defects (e.g. after the vehicle changes). Items the user set by hand
 * (`touched`) keep their value; their carried entry is recorded as already decided.
 */
export function carryOverDefects(
  prev: DvcItemState,
  defects: PreviousDefect[],
  touched: ReadonlySet<string>
): DvcItemState {
  const state: DvcItemState = { ...prev, carried: {} };
  for (const old of Object.values(prev.carried)) {
    if (touched.has(old.key)) continue;
    if (old.kind === "status") {
      const next = { ...state.statusRatings };
      delete next[old.key];
      state.statusRatings = next;
    } else {
      const next = { ...state.equipChecks };
      delete next[old.key];
      state.equipChecks = next;
    }
    dropCarriedDescription(state, old);
  }
  const carried: Record<string, CarriedDefect> = {};
  for (const d of defects) {
    if (touched.has(d.key)) {
      carried[d.key] = { ...d, decision: isDefective(state, d.kind, d.key) ? "present" : "fixed" };
      continue;
    }
    setDefective(state, d.kind, d.key, true);
    if (d.kind === "status" && d.description && !state.failureDescs[d.key]) {
      state.failureDescs = { ...state.failureDescs, [d.key]: d.description };
    }
    carried[d.key] = { ...d, decision: "pending" };
  }
  state.carried = carried;
  return state;
}

/** Driver confirms a carried defect from the "previous defects" panel. */
export function decideCarriedDefect(prev: DvcItemState, key: string, decision: "present" | "fixed"): DvcItemState {
  const d = prev.carried[key];
  if (!d) return prev;
  const state: DvcItemState = { ...prev, carried: { ...prev.carried, [key]: { ...d, decision } } };
  setDefective(state, d.kind, key, decision === "present");
  if (decision === "fixed") dropCarriedDescription(state, d);
  else if (d.kind === "status" && d.description && !state.failureDescs[key]) {
    state.failureDescs = { ...state.failureDescs, [key]: d.description };
  }
  return state;
}

/** Pass/fail or yes/no choice in the main grid; choosing on a carried item counts as its confirmation. */
export function setItem(
  prev: DvcItemState,
  kind: PreviousDefect["kind"],
  key: string,
  defective: boolean
): DvcItemState {
  const state: DvcItemState = { ...prev };
  setDefective(state, kind, key, defective);
  const d = prev.carried[key];
  if (d) state.carried = { ...prev.carried, [key]: { ...d, decision: defective ? "present" : "fixed" } };
  return state;
}

export function pendingCarriedDefects(state: DvcItemState): CarriedDefect[] {
  return Object.values(state.carried).filter((d) => d.decision === "pending");
}

export type PrefillSource = "mission" | "last_check";

/** Short date (YYYY-MM-DD) from an ISO or SQLite timestamp. */
export function shortDate(at: string | null | undefined): string {
  return String(at || "").slice(0, 10);
}

export function prefillHintText(source: PrefillSource, at?: string | null): string {
  if (source === "mission") return "from mission";
  const d = shortDate(at);
  return d ? `from last check (${d})` : "from last check";
}

const ODO_SOURCE_LABEL: Record<"check" | "trip" | "trip_reading", string> = {
  check: "vehicle check",
  trip: "trip log",
  trip_reading: "trip odometer reading",
};

export function odometerHintText(
  km: number,
  source: "check" | "trip" | "trip_reading" | null,
  at: string | null
): string {
  const where = [source ? ODO_SOURCE_LABEL[source] : "", shortDate(at)].filter(Boolean).join(", ");
  return `prefilled with the last recorded reading, ${km.toLocaleString("en-US")} km${where ? ` (${where})` : ""}. Confirm against the gauge.`;
}

/** Non-blocking warning under the odometer input. */
export function odometerWarning(input: string, lastKm: number | null, stillPrefilled: boolean): string | null {
  if (lastKm == null) return null;
  const n = parseInt(input.trim(), 10);
  if (!Number.isFinite(n)) return null;
  if (n < lastKm) {
    return `Lower than the last recorded reading (${lastKm.toLocaleString("en-US")} km). Double-check the gauge.`;
  }
  if (stillPrefilled && n === lastKm) {
    return "Still the last recorded reading. Update it if the vehicle has moved since.";
  }
  return null;
}
