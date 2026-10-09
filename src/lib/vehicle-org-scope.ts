/**
 * Which organization(s) a vehicle belongs to, now that a vehicle can be seconded.
 *
 * - `organization_id` is always the OWNER.
 * - `seconded_to_org` (NULL / '' = not seconded) is the BORROWING org while seconded.
 *
 * Two scopes:
 * - visible:  owner OR borrower. Lists, detail, filters: the owner keeps seeing its
 *             seconded-out vehicle (marked "Seconded to ZM"), the borrower sees it too.
 * - operable: the org that may allocate / dispatch it right now — the borrower while
 *             seconded, otherwise the owner. Reservation candidates, reserve / assign
 *             same-org checks, trip readiness, map and dashboard fleet counts.
 *
 * Pure module (no db import) so client components and test scripts can use it.
 */

/** Loose on purpose so raw `SELECT *` rows (Record<string, unknown>) and typed rows both fit. */
export interface VehicleOrgFields {
  organization_id?: unknown;
  seconded_to_org?: unknown;
  secondment_expected_return?: unknown;
}

export interface OrgScopeSql {
  sql: string;
  params: string[];
}

function col(alias: string | undefined, name: string): string {
  return alias ? `${alias}.${name}` : name;
}

function secondedTo(v: VehicleOrgFields): string {
  return String(v.seconded_to_org ?? "").trim();
}

export function isVehicleSeconded(v: VehicleOrgFields): boolean {
  return secondedTo(v) !== "";
}

/** The org operating the vehicle right now: borrower while seconded, else owner. */
export function vehicleOperatingOrgId(v: VehicleOrgFields): string {
  return secondedTo(v) || String(v.organization_id ?? "");
}

/** Vehicle is in scope for org X: organization_id = X OR seconded_to_org = X. */
export function vehicleVisibleToOrg(v: VehicleOrgFields, orgId: string): boolean {
  if (!orgId) return false;
  return String(v.organization_id ?? "") === orgId || secondedTo(v) === orgId;
}

/** Org X may allocate this vehicle: it is the borrower, or the owner of a vehicle not seconded out. */
export function vehicleOperableByOrg(v: VehicleOrgFields, orgId: string): boolean {
  if (!orgId) return false;
  return vehicleOperatingOrgId(v) === orgId;
}

/** SQL twin of vehicleVisibleToOrg. `alias` is the vehicles table alias (omit for bare `vehicles`). */
export function vehicleVisibleToOrgSql(orgId: string, alias?: string): OrgScopeSql {
  return {
    sql: `(${col(alias, "organization_id")} = ? OR ${col(alias, "seconded_to_org")} = ?)`,
    params: [orgId, orgId],
  };
}

/** SQL twin of vehicleOperableByOrg. */
export function vehicleOperableByOrgSql(orgId: string, alias?: string): OrgScopeSql {
  const sec = col(alias, "seconded_to_org");
  return {
    sql: `((${col(alias, "organization_id")} = ? AND COALESCE(${sec}, '') = '') OR ${sec} = ?)`,
    params: [orgId, orgId],
  };
}

/** Relative to the viewing org: "in" = borrowed from another country, "out" = lent away. */
export function secondmentDirection(v: VehicleOrgFields, viewerOrgId: string): "in" | "out" | null {
  const to = secondedTo(v);
  if (!to || !viewerOrgId) return null;
  if (to === viewerOrgId) return "in";
  if (String(v.organization_id ?? "") === viewerOrgId) return "out";
  return null;
}

/** Overdue = seconded, an expected return date was set, and today is after it. Open-ended never goes overdue. */
export function isSecondmentOverdue(v: VehicleOrgFields, todayYmd: string): boolean {
  if (!isVehicleSeconded(v)) return false;
  const ret = String(v.secondment_expected_return ?? "").trim().slice(0, 10);
  if (!ret) return false;
  return todayYmd.slice(0, 10) > ret;
}

/**
 * Why org X may not allocate this vehicle (null = allowed). Used by reserve-vehicle,
 * vehicle-request assign and trip readiness so the error wording is consistent.
 */
export function vehicleAllocationOrgError(
  v: VehicleOrgFields & { code?: unknown },
  orgId: string,
  secondedToLabel?: string
): string | null {
  if (vehicleOperableByOrg(v, orgId)) return null;
  const code = String(v.code ?? "").trim() || "This vehicle";
  if (String(v.organization_id ?? "") === orgId && isVehicleSeconded(v)) {
    const to = secondedToLabel || secondedTo(v);
    return `${code} is seconded to ${to} and cannot be allocated by its owner until it is returned.`;
  }
  return "Vehicle belongs to a different organization.";
}
