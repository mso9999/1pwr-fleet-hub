/**
 * Which org a seconded vehicle's cost / fuel / TCO is attributed to.
 *
 * ONE switch: env FM_SECONDMENT_COST_ATTRIBUTION = "user" | "owner" (default "user").
 * - "user":  while seconded, the vehicle's cost rows count for the borrowing (seconded-to) org.
 * - "owner": cost always stays with organization_id (the owner), as before secondment existed.
 *
 * Granularity is the vehicle's CURRENT state: a seconded vehicle's whole cost row moves to the
 * borrower while it is seconded and moves back on return. Events are not split by date.
 *
 * Every cost / TCO / performance query that scopes vehicles by org should go through
 * vehicleCostScopeSql / costAttributionOrgSql so flipping the switch is a one-line change.
 */
import { vehicleOperatingOrgId, type OrgScopeSql, type VehicleOrgFields } from "./vehicle-org-scope";

export type SecondmentCostAttribution = "user" | "owner";

export const SECONDMENT_COST_ATTRIBUTION_ENV = "FM_SECONDMENT_COST_ATTRIBUTION";

export function secondmentCostAttribution(
  env: Record<string, string | undefined> = process.env
): SecondmentCostAttribution {
  const raw = String(env[SECONDMENT_COST_ATTRIBUTION_ENV] ?? "").trim().toLowerCase();
  return raw === "owner" ? "owner" : "user";
}

/** Org that carries this vehicle's cost right now. */
export function costAttributionOrgId(
  v: VehicleOrgFields,
  mode: SecondmentCostAttribution = secondmentCostAttribution()
): string {
  return mode === "user" ? vehicleOperatingOrgId(v) : String(v.organization_id ?? "");
}

/** SQL expression for costAttributionOrgId over a vehicles alias (e.g. JOIN organizations o ON o.id = <expr>). */
export function costAttributionOrgSql(
  alias?: string,
  mode: SecondmentCostAttribution = secondmentCostAttribution()
): string {
  const owner = alias ? `${alias}.organization_id` : "organization_id";
  const sec = alias ? `${alias}.seconded_to_org` : "seconded_to_org";
  return mode === "user" ? `COALESCE(NULLIF(${sec}, ''), ${owner})` : owner;
}

/** WHERE fragment: the vehicle's cost is attributed to orgId. */
export function vehicleCostScopeSql(
  orgId: string,
  alias?: string,
  mode: SecondmentCostAttribution = secondmentCostAttribution()
): OrgScopeSql {
  return { sql: `${costAttributionOrgSql(alias, mode)} = ?`, params: [orgId] };
}
