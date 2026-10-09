/**
 * Request body for POST /api/missions/[id]/reserve-vehicle.
 * overrideReason is included only when it meets the server's 8-character minimum;
 * callers should block submission (with a message) when 1–7 characters are typed.
 */
export const OVERRIDE_REASON_MIN_LENGTH = 8;

export function reserveVehicleBody(
  vehicleId: string,
  overrideReason: string
): { vehicleId: string; overrideReason?: string } {
  const reason = (overrideReason || "").trim();
  return reason.length >= OVERRIDE_REASON_MIN_LENGTH ? { vehicleId, overrideReason: reason } : { vehicleId };
}
