/**
 * Transmission-scoped driving authorizations ("AT-only derate").
 *
 * EHS can derate a driving authorization (e.g. fleet_vehicle_onroad) to
 * `automatic_only` when the road test was done in an automatic. The derated
 * grant is valid ONLY for vehicles whose vehicles.transmission is recorded as
 * 'automatic' — a manual vehicle blocks, and an unrecorded transmission also
 * blocks (the approval is valid only for vehicles known to be automatic).
 *
 * The scope lives on ehs_operator_authorizations.transmission_scope so lifting
 * the derate after a manual road test is a single audit-logged update.
 */
import type Database from "better-sqlite3";
import { DEFAULT_OPERATOR_CATEGORY } from "@/lib/ehs-operator-categories";

export type VehicleTransmission = "automatic" | "manual" | "";
export type TransmissionScope = "any" | "automatic_only";

export function normalizeTransmission(raw: unknown): VehicleTransmission {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  if (["automatic", "auto", "at", "a/t", "atx", "tiptronic", "cvt"].includes(s)) return "automatic";
  if (["manual", "mt", "m/t", "stick", "standard"].includes(s)) return "manual";
  return "";
}

export function normalizeTransmissionScope(raw: unknown): TransmissionScope {
  return String(raw ?? "").trim().toLowerCase() === "automatic_only" ? "automatic_only" : "any";
}

export function getVehicleTransmission(
  db: Database.Database,
  vehicleId: string,
): { transmission: VehicleTransmission; code: string } {
  const row = db
    .prepare("SELECT code, transmission FROM vehicles WHERE id = ?")
    .get(vehicleId) as { code?: string; transmission?: string | null } | undefined;
  return {
    transmission: normalizeTransmission(row?.transmission),
    code: String(row?.code || "").trim(),
  };
}

/** The operator's transmission scope for a category (default 'any' when no row). */
export function getDriverTransmissionScope(
  db: Database.Database,
  operatorId: string,
  category: string = DEFAULT_OPERATOR_CATEGORY,
): TransmissionScope {
  const row = db
    .prepare(
      `SELECT transmission_scope FROM ehs_operator_authorizations
       WHERE operator_id = ? AND category_code = ?`,
    )
    .get(operatorId, category) as { transmission_scope?: string | null } | undefined;
  return normalizeTransmissionScope(row?.transmission_scope);
}

export interface TransmissionGateResult {
  status: "satisfied" | "blocked";
  detail: string;
  vehicleTransmission: VehicleTransmission;
  vehicleCode: string;
  driverScope: TransmissionScope;
  driverName: string;
}

/**
 * Gate: may this operator drive this vehicle under the transmission derate?
 * Full-scope drivers are always satisfied; AT-only drivers need a vehicle
 * recorded as automatic.
 */
export function evaluateTransmissionGate(
  db: Database.Database,
  input: {
    organizationId: string;
    operatorId: string;
    vehicleId: string;
    category?: string;
  },
): TransmissionGateResult {
  const vehicle = getVehicleTransmission(db, input.vehicleId);
  const driver = db
    .prepare(
      `SELECT display_name, email FROM ehs_approved_drivers
       WHERE id = ? AND organization_id = ?`,
    )
    .get(input.operatorId, input.organizationId) as
    | { display_name?: string; email?: string }
    | undefined;
  const driverName = String(driver?.display_name || driver?.email || "This driver").trim();
  const driverScope = getDriverTransmissionScope(db, input.operatorId, input.category);

  const base: Omit<TransmissionGateResult, "status" | "detail"> = {
    vehicleTransmission: vehicle.transmission,
    vehicleCode: vehicle.code,
    driverScope,
    driverName,
  };

  if (driverScope !== "automatic_only") {
    return {
      ...base,
      status: "satisfied",
      detail: vehicle.transmission
        ? `${driverName} holds a full on-road authorization (any transmission); ${vehicle.code || "vehicle"} is ${vehicle.transmission}.`
        : `${driverName} holds a full on-road authorization (any transmission).`,
    };
  }

  if (vehicle.transmission === "automatic") {
    return {
      ...base,
      status: "satisfied",
      detail: `${driverName} is approved for automatic vehicles only; ${vehicle.code || "vehicle"} is recorded as automatic.`,
    };
  }
  if (vehicle.transmission === "manual") {
    return {
      ...base,
      status: "blocked",
      detail: `${driverName} is approved for automatic-transmission vehicles only, and ${vehicle.code || "this vehicle"} is manual. Assign an automatic vehicle or a fully-authorized driver.`,
    };
  }
  return {
    ...base,
    status: "blocked",
    detail: `${driverName} is approved for automatic-transmission vehicles only, and ${vehicle.code || "this vehicle"} has no transmission recorded. Fleet must record the vehicle's transmission before this driver can take it.`,
  };
}
