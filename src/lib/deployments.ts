import type Database from "better-sqlite3";

/**
 * Field-deployment query layer for HR-facing APIs.
 *
 * A "field deployment" for an employee = a departing driver vehicle check
 * whose passenger manifest references the employee by HR employee_id, joined
 * to its trip (via dvc.trip_id) for the actual departure / return timestamps.
 *
 * The `deployment_start_date` HR treats as canonical is the trip's
 * `departed_at` (the moment the vehicle physically left), falling back to
 * `checkout_at` and then the inspection's `created_at` so the field is always
 * present even before the new departure workflow is adopted everywhere.
 */

export type DeploymentStatus = "active" | "completed" | "pending_departure";

export interface DeploymentRecord {
  employee_id: string;
  deployment_start_date: string | null;
  deployment_end_date: string | null;
  inspection_id: string;
  inspection_url: string;
  vehicle: string | null;
  registration: string | null;
  status: DeploymentStatus;
  organization_id: string;
  destination: string | null;
  departure_location: string | null;
  check_date: string;
}

interface DeploymentRow {
  inspection_id: string;
  organization_id: string;
  vehicle_id: string;
  check_date: string;
  created_at: string;
  passenger_manifest: string | null;
  overall_pass: number;
  direction: string;
  vehicle_code: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  license_plate: string | null;
  trip_id: string | null;
  departed_at: string | null;
  checkin_at: string | null;
  checkout_at: string | null;
  destination: string | null;
  departure_location: string | null;
}

export function fleetPublicBaseUrl(): string {
  return String(process.env.FLEET_PUBLIC_BASE_URL || "https://fm.1pwrafrica.com").replace(/\/$/, "");
}

export function inspectionUrl(inspectionId: string): string {
  return `${fleetPublicBaseUrl()}/vehicle-checks?inspection=${encodeURIComponent(inspectionId)}`;
}

function jsonExtractExists(db: Database.Database, manifestJson: string, employeeId: string): boolean {
  // better-sqlite3 ships SQLite with JSON1; this is the most reliable way to
  // test membership without false positives on substrings of names/ids.
  try {
    const row = db
      .prepare(
        `SELECT 1 FROM json_each(?) je WHERE json_extract(je.value, '$.employee_id') = ? LIMIT 1`
      )
      .get(manifestJson || "[]", employeeId) as { 1: number } | undefined;
    return !!row;
  } catch {
    // Fallback: substring search on the serialized employee_id. Less precise
    // but still usable on SQLite builds without JSON1.
    return manifestJson.includes(`"employee_id":"${employeeId}"`) ||
      manifestJson.includes(`"employee_id": "${employeeId}"`);
  }
}

function deriveStatus(
  departedAt: string | null,
  checkinAt: string | null,
  tripId: string | null
): DeploymentStatus {
  if (checkinAt) return "completed";
  if (departedAt) return "active";
  if (tripId) return "pending_departure";
  // No trip link: the inspection exists but the checkout hasn't happened.
  return "pending_departure";
}

function rowToDeployment(row: DeploymentRow, employeeId: string): DeploymentRecord {
  const startDate =
    row.departed_at ||
    row.checkout_at ||
    row.created_at ||
    null;
  const status = deriveStatus(row.departed_at, row.checkin_at, row.trip_id);
  const vehicleLabel = row.vehicle_code
    ? `${row.vehicle_code} — ${row.vehicle_make ?? ""} ${row.vehicle_model ?? ""}`.trim()
    : null;
  return {
    employee_id: employeeId,
    deployment_start_date: startDate,
    deployment_end_date: row.checkin_at || null,
    inspection_id: row.inspection_id,
    inspection_url: inspectionUrl(row.inspection_id),
    vehicle: vehicleLabel,
    registration: row.license_plate || null,
    status,
    organization_id: row.organization_id,
    destination: row.destination || null,
    departure_location: row.departure_location || null,
    check_date: row.check_date,
  };
}

/**
 * Returns deployments for an employee, newest first. Optionally constrained
 * to a [from, to] date range (inclusive) on `check_date`.
 *
 * Implementation note: SQLite's JSON functions are not index-friendly, so we
 * first narrow the candidate set with a coarse LIKE filter on the manifest
 * column (cheap with the check_date index), then confirm membership with
 * json_extract. This keeps the scan bounded for orgs with many checks.
 */
export function listDeploymentsForEmployee(
  db: Database.Database,
  input: {
    employeeId: string;
    from?: string;
    to?: string;
    limit?: number;
  }
): DeploymentRecord[] {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  let sql = `
    SELECT dvc.id as inspection_id, dvc.organization_id, dvc.vehicle_id, dvc.check_date,
           dvc.created_at, dvc.passenger_manifest, dvc.overall_pass, dvc.direction,
           v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model, v.license_plate,
           t.id as trip_id, t.departed_at, t.checkin_at, t.checkout_at, t.destination, t.departure_location
    FROM driver_vehicle_checks dvc
    JOIN vehicles v ON dvc.vehicle_id = v.id
    LEFT JOIN trips t ON dvc.trip_id = t.id
    WHERE dvc.direction = 'departing'
      AND dvc.passenger_manifest LIKE ?
  `;
  const params: unknown[] = [`%"employee_id":"${input.employeeId}"%`];
  if (input.from) {
    sql += " AND dvc.check_date >= ?";
    params.push(input.from);
  }
  if (input.to) {
    sql += " AND dvc.check_date <= ?";
    params.push(input.to);
  }
  sql += " ORDER BY datetime(dvc.created_at) DESC LIMIT ?";
  params.push(limit * 4); // over-fetch then filter by json_extract for precision

  const rows = db.prepare(sql).all(...params) as DeploymentRow[];
  const out: DeploymentRecord[] = [];
  for (const row of rows) {
    if (!jsonExtractExists(db, row.passenger_manifest || "[]", input.employeeId)) continue;
    out.push(rowToDeployment(row, input.employeeId));
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Returns the employee's currently-active field deployment (status = "active"),
 * i.e. the vehicle has departed but not yet checked in. Returns null if none.
 */
export function currentDeploymentForEmployee(
  db: Database.Database,
  employeeId: string
): DeploymentRecord | null {
  const all = listDeploymentsForEmployee(db, { employeeId, limit: 50 });
  return all.find((d) => d.status === "active") ?? null;
}
