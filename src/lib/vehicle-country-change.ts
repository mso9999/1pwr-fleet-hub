/** Inspection types that qualify as a completed mechanical checklist for cross-country transfer. */
export const MECHANICAL_INSPECTION_TYPES_FOR_TRANSFER = new Set([
  "mechanical-transfer",
  "detailed",
]);

export type VehicleCountryChangeKind = "data_correction" | "secondment" | "permanent_transfer";

export type VehicleCountryChangeStatus =
  | "pending_fleet"
  | "pending_executive"
  | "approved"
  | "rejected"
  | "cancelled";

export function isVehicleCountryChangeKind(v: string): v is VehicleCountryChangeKind {
  return v === "data_correction" || v === "secondment" || v === "permanent_transfer";
}
