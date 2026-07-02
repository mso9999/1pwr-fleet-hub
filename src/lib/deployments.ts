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

export type DeploymentSource =
  | "driver_vehicle_check"
  | "straggler_public_transport"
  | "public_transport_mission";

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
  /** Origin of this deployment record — DVC passenger vs straggler on a
   * mission's personnel manifest who travelled by public transport. */
  source: DeploymentSource;
  /** For straggler deployments: the mission id they were planned to ride
   * with but missed. Null for on-vehicle DVC deployments. */
  mission_id: string | null;
  /** Optional note captured on the manifest entry (e.g. "missed HQ
   * departure; took public taxi to site"). */
  notes: string | null;
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
  // Scenario B: trips linked to a public-transport sentinel vehicle are
  // vehicle-less deployments. Return `vehicle: null` and surface the
  // transport mode so HR can distinguish them from real-vehicle DVCs.
  const isPublicTransportSentinel = row.vehicle_code === "PUBLIC-TRANSPORT";
  return {
    employee_id: employeeId,
    deployment_start_date: startDate,
    deployment_end_date: row.checkin_at || null,
    inspection_id: row.inspection_id,
    inspection_url: inspectionUrl(row.inspection_id),
    vehicle: isPublicTransportSentinel ? null : vehicleLabel,
    registration: isPublicTransportSentinel ? null : (row.license_plate || null),
    status,
    organization_id: row.organization_id,
    destination: row.destination || null,
    departure_location: row.departure_location || null,
    check_date: row.check_date,
    source: isPublicTransportSentinel ? "public_transport_mission" : "driver_vehicle_check",
    mission_id: null,
    notes: null,
  };
}

interface StragglerMissionRow {
  mission_id: string;
  organization_id: string;
  personnel_manifest: string | null;
  departure_date: string;
  return_date: string;
  destination: string | null;
  trip_id: string | null;
  departed_at: string | null;
  checkin_at: string | null;
  checkout_at: string | null;
  vehicle_id: string | null;
  vehicle_code: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  license_plate: string | null;
  inspection_id: string | null;
  inspection_check_date: string | null;
  transport_mode?: string | null;
  created_at: string;
}

interface StragglerEntry {
  travel_mode: string;
  notes?: string;
}

function readStragglerEntry(
  db: Database.Database,
  manifestJson: string,
  employeeId: string,
): StragglerEntry | null {
  try {
    const row = db
      .prepare(
        `SELECT json_extract(je.value, '$.travel_mode') AS travel_mode,
                json_extract(je.value, '$.notes') AS notes
           FROM json_each(?) je
          WHERE json_extract(je.value, '$.employee_id') = ?
          LIMIT 1`
      )
      .get(manifestJson || "[]", employeeId) as
      | { travel_mode?: string | null; notes?: string | null }
      | undefined;
    if (!row) return null;
    const mode = String(row.travel_mode ?? "on_vehicle").toLowerCase();
    if (mode !== "straggler_public_transport") return null;
    return {
      travel_mode: "straggler_public_transport",
      notes: typeof row.notes === "string" ? row.notes : undefined,
    };
  } catch {
    // SQLite without JSON1: fall back to substring presence test. Less
    // precise but still usable on legacy builds.
    if (!manifestJson.includes(`"employee_id":"${employeeId}"`) &&
        !manifestJson.includes(`"employee_id": "${employeeId}"`)) {
      return null;
    }
    if (!manifestJson.includes('"travel_mode":"straggler_public_transport"') &&
        !manifestJson.includes('"travel_mode": "straggler_public_transport"')) {
      return null;
    }
    return { travel_mode: "straggler_public_transport" };
  }
}

function stragglerRowToDeployment(
  row: StragglerMissionRow,
  employeeId: string,
  entry: StragglerEntry,
): DeploymentRecord {
  const startDate = row.departed_at || row.checkout_at || row.departure_date || row.created_at || null;
  const status = deriveStatus(row.departed_at, row.checkin_at, row.trip_id);
  const vehicleLabel = row.vehicle_code
    ? `${row.vehicle_code} — ${row.vehicle_make ?? ""} ${row.vehicle_model ?? ""}`.trim()
    : null;
  const inspectionId = row.inspection_id || "";
  return {
    employee_id: employeeId,
    deployment_start_date: startDate,
    deployment_end_date: row.checkin_at || null,
    inspection_id: inspectionId,
    inspection_url: inspectionId ? inspectionUrl(inspectionId) : "",
    vehicle: vehicleLabel,
    registration: row.license_plate || null,
    status,
    organization_id: row.organization_id,
    destination: row.destination || null,
    departure_location: null,
    check_date: row.inspection_check_date || row.departure_date || row.created_at,
    source: "straggler_public_transport",
    mission_id: row.mission_id,
    notes: entry.notes ?? null,
  };
}

function publicTransportRowToDeployment(
  row: StragglerMissionRow,
  employeeId: string,
  entry: StragglerEntry,
): DeploymentRecord {
  const startDate = row.departed_at || row.checkout_at || row.departure_date || row.created_at || null;
  const status = deriveStatus(row.departed_at, row.checkin_at, row.trip_id);
  const inspectionId = row.inspection_id || "";
  return {
    employee_id: employeeId,
    deployment_start_date: startDate,
    deployment_end_date: row.checkin_at || null,
    inspection_id: inspectionId,
    inspection_url: inspectionId ? inspectionUrl(inspectionId) : "",
    vehicle: null,
    registration: null,
    status,
    organization_id: row.organization_id,
    destination: row.destination || null,
    departure_location: null,
    check_date: row.inspection_check_date || row.departure_date || row.created_at,
    source: "public_transport_mission",
    mission_id: row.mission_id,
    notes: entry.notes ?? null,
  };
}

/**
 * Returns deployments for an employee, newest first. Optionally constrained
 * to a [from, to] date range (inclusive) on `check_date`.
 *
 * Three sources are merged:
 *   1. Driver-vehicle-check (DVC) passenger manifests where the employee
 *      rode on the company vehicle (`source: "driver_vehicle_check"`).
 *   2. Mission personnel manifests where the employee is marked
 *      `travel_mode = "straggler_public_transport"` — they missed the
 *      company-vehicle departure and travelled to the site separately via
 *      public transport, but are still associated with the same mission
 *      (`source: "straggler_public_transport"`).
 *   3. Public-transport missions (`missions.transport_mode = 'public_transport'`)
 *      where the employee is listed in the personnel manifest — the whole
 *      team travelled by public transport, no company vehicle involved
 *      (`source: "public_transport_mission"`). The trip's departure /
 *      return timestamps anchor the deployment clock for HR.
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

  if (out.length < limit) {
    // Pull straggler + public-transport deployments from
    // missions.personnel_manifest. We still have budget remaining in
    // `limit - out.length`. The single query covers both Scenario A
    // (straggler passengers on a company-vehicle mission) and Scenario B
    // (any passenger on a public-transport mission); the per-row
    // discriminator picks the right source label.
    const remaining = limit - out.length;
    let missionSql = `
      SELECT m.id AS mission_id, m.organization_id, m.personnel_manifest,
             m.departure_date, m.return_date, m.destination, m.created_at,
             m.trip_id, m.assigned_vehicle_id, m.transport_mode,
             t.departed_at, t.checkin_at, t.checkout_at,
             v.code AS vehicle_code, v.make AS vehicle_make, v.model AS vehicle_model, v.license_plate,
             dvc.id AS inspection_id, dvc.check_date AS inspection_check_date
        FROM missions m
        LEFT JOIN trips t ON m.trip_id = t.id
        LEFT JOIN vehicles v ON m.assigned_vehicle_id = v.id
        LEFT JOIN driver_vehicle_checks dvc ON dvc.trip_id = t.id AND dvc.direction = 'departing'
       WHERE m.personnel_manifest LIKE ?
    `;
    const missionParams: unknown[] = [
      `%"employee_id":"${input.employeeId}"%`,
    ];
    if (input.from) {
      missionSql += " AND m.departure_date >= ?";
      missionParams.push(input.from);
    }
    if (input.to) {
      missionSql += " AND m.departure_date <= ?";
      missionParams.push(input.to);
    }
    missionSql += " ORDER BY datetime(m.created_at) DESC LIMIT ?";
    missionParams.push(remaining * 4);

    const missionRows = db
      .prepare(missionSql)
      .all(...missionParams) as Array<StragglerMissionRow & { transport_mode?: string | null }>;
    for (const row of missionRows) {
      const entry = readStragglerEntry(db, row.personnel_manifest || "[]", input.employeeId);
      if (!entry) {
        // Public-transport mission: travel_mode is forced to 'on_vehicle'
        // for all passengers, so readStragglerEntry returns null. We still
        // need to surface them — confirm membership via json_extract.
        const tm = String(row.transport_mode || "company_vehicle").toLowerCase();
        if (tm !== "public_transport") continue;
        if (!jsonExtractExists(db, row.personnel_manifest || "[]", input.employeeId)) continue;
        out.push(
          publicTransportRowToDeployment(row, input.employeeId, { travel_mode: "on_vehicle" }),
        );
        if (out.length >= limit) break;
        continue;
      }
      out.push(stragglerRowToDeployment(row, input.employeeId, entry));
      if (out.length >= limit) break;
    }
  }

  // Final sort: newest deployment_start_date first. Stable enough for HR
  // display — all three sources surface in one ordered list.
  out.sort((a, b) => {
    const aDate = a.deployment_start_date || a.check_date || "";
    const bDate = b.deployment_start_date || b.check_date || "";
    return bDate.localeCompare(aDate);
  });
  return out.slice(0, limit);
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
