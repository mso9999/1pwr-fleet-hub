/**
 * F006 / fleet policy: a personal-vehicle claim may be approved only if either
 * no operational fleet vehicle was available at submit time (pool snapshot = 0), or
 * an explicit override is recorded in `notes`.
 */

export const PVR_VEHICLE_AVAILABILITY_OVERRIDE_MIN_CHARS = 40;

export function pvrOverrideNotesMeetPolicy(notes: string): boolean {
  return String(notes || "").trim().length >= PVR_VEHICLE_AVAILABILITY_OVERRIDE_MIN_CHARS;
}

/** When pool snapshot at submit was &gt; 0, approval requires substantive override text in notes. */
export function canApprovePvrClaim(
  poolOperationalCountSnapshot: number,
  notes: string
): boolean {
  const snap = Number(poolOperationalCountSnapshot);
  if (!Number.isFinite(snap) || snap <= 0) return true;
  return pvrOverrideNotesMeetPolicy(notes);
}

export function pvrVehicleAvailabilityOverrideError(): string {
  return `When operational fleet vehicles were available at claim time, Notes must document the override (at least ${PVR_VEHICLE_AVAILABILITY_OVERRIDE_MIN_CHARS} characters: who approved the exception, why a 1PWR vehicle was not used, or similar).`;
}
