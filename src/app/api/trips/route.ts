import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import {
  assertMissionEligibleForTripCreation,
  ensureUnallocatedVehicle,
} from "@/lib/mission-checkout";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import { evaluateTransmissionGate } from "@/lib/transmission-scope";
import { v4 as uuidv4 } from "uuid";
import { isMultiStopRolloutEnabledServer } from "@/lib/feature-flags";
import { canViewPrivateDraft } from "@/lib/fleet-roles";
import {
  normalizeRouteStops,
  normalizeTripShape,
  routeStopsEqual,
} from "@/lib/trip-route";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const draftsOnly = searchParams.get("drafts") === "true";
  const vehicleId = searchParams.get("vehicleId");
  const active = searchParams.get("active");
  const includeStops = searchParams.get("includeStops") === "true";

  const org = searchParams.get("org") || "1pwr_lesotho";
  const allOrgs = searchParams.get("allOrgs") === "true" && vehicleId;

  if (draftsOnly) {
    const user = await getVerifiedFleetUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    db.prepare(
      "DELETE FROM trip_drafts WHERE status = 'draft' AND datetime(expires_at) <= datetime('now')"
    ).run();
    const rows = db
      .prepare(
        `SELECT * FROM trip_drafts
         WHERE organization_id = ? AND status = 'draft'
         ORDER BY updated_at DESC LIMIT 200`
      )
      .all(org) as Array<Record<string, unknown>>;
    const visible = rows.filter((row) =>
      canViewPrivateDraft({
        role: user.role,
        department: user.department,
        isCreator: String(row.created_by_id || "") === user.id,
      })
    );
    return NextResponse.json(visible);
  }

  let query = `
    SELECT t.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model,
           m.title AS mission_title,
           m.approval_status AS mission_approval_status,
           m.lifecycle_status AS mission_lifecycle_status,
           (SELECT MAX(dvc.created_at)
              FROM driver_vehicle_checks dvc
             WHERE dvc.trip_id = t.id
               AND lower(dvc.direction) = 'departing') AS trip_checklist_at
    FROM trips t
    LEFT JOIN vehicles v ON t.vehicle_id = v.id
    LEFT JOIN missions m ON t.mission_id = m.id
    WHERE ${allOrgs ? "t.vehicle_id = ?" : "t.organization_id = ?"}
  `;
  const params: string[] = allOrgs ? [vehicleId as string] : [org];

  if (!allOrgs && vehicleId) {
    query += " AND t.vehicle_id = ?";
    params.push(vehicleId);
  }
  if (active === "true") {
    query += " AND t.checkin_at IS NULL";
  }

  query += " ORDER BY t.checkout_at DESC LIMIT 100";

  const trips = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
  if (!includeStops || trips.length === 0) {
    return NextResponse.json(trips);
  }
  const tripIds = trips.map((t) => String(t.id || ""));
  const placeholders = tripIds.map(() => "?").join(", ");
  const stopRows = db
    .prepare(
      `SELECT * FROM trip_stops
       WHERE trip_id IN (${placeholders})
       ORDER BY trip_id, stop_number ASC`
    )
    .all(...tripIds) as Array<Record<string, unknown>>;
  const byTrip = new Map<string, Array<Record<string, unknown>>>();
  for (const s of stopRows) {
    const k = String(s.trip_id || "");
    const arr = byTrip.get(k) ?? [];
    arr.push(s);
    byTrip.set(k, arr);
  }
  const out = trips.map((t) => ({
    ...t,
    stops: byTrip.get(String(t.id || "")) ?? [],
  }));
  return NextResponse.json(out);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const body = await request.json();
  const action = String(body.action || body.intent || "").toLowerCase();
  const organizationId = String(body.organizationId || "1pwr_lesotho");

  if (action === "savedraft" || action === "save_draft" || action === "draft") {
    db.prepare(
      "DELETE FROM trip_drafts WHERE status = 'draft' AND datetime(expires_at) <= datetime('now')"
    ).run();
    const draftId = typeof body.draftId === "string" && body.draftId.trim()
      ? body.draftId.trim()
      : uuidv4();
    const missionId = typeof body.missionId === "string" ? body.missionId.trim() : "";
    const now = new Date().toISOString();
    const payload = {
      missionId,
      driverName: String(body.driverName || ""),
      odoStart: body.odoStart ?? "",
      departureLocation: String(body.departureLocation || ""),
      destination: String(body.destination || ""),
      missionType: String(body.missionType || "other"),
      passengers: String(body.passengers || ""),
      loadOut: String(body.loadOut || ""),
      loadIn: String(body.loadIn || ""),
      stops: Array.isArray(body.stops) ? body.stops : [],
      routeChangeReason: String(body.routeChangeReason || ""),
      overrideReason: String(body.overrideReason || ""),
      tripShape: normalizeTripShape(body.tripShape),
      missionProfile: String(body.missionProfile || "local"),
      updatedAt: now,
    };

    const existing = db
      .prepare("SELECT id, created_by_id FROM trip_drafts WHERE id = ?")
      .get(draftId) as { id: string; created_by_id: string } | undefined;
    if (existing && existing.created_by_id !== user.id && user.role !== "admin" && user.role !== "superadmin") {
      return NextResponse.json({ error: "Not allowed to edit this trip draft." }, { status: 403 });
    }

    if (existing) {
      db.prepare(
        `UPDATE trip_drafts
         SET organization_id = ?, mission_id = ?, payload_json = ?, updated_at = ?, expires_at = datetime('now', '+30 days')
         WHERE id = ?`
      ).run(organizationId, missionId, JSON.stringify(payload), now, draftId);
    } else {
      db.prepare(
        `INSERT INTO trip_drafts (
           id, organization_id, created_by_id, created_by_name, mission_id, payload_json, status, expires_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'draft', datetime('now', '+30 days'), ?, ?)`
      ).run(draftId, organizationId, user.id, user.name || user.email, missionId, JSON.stringify(payload), now, now);
    }

    const row = db
      .prepare("SELECT * FROM trip_drafts WHERE id = ?")
      .get(draftId) as Record<string, unknown> | undefined;
    return NextResponse.json(row ?? { id: draftId }, { status: existing ? 200 : 201 });
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const rawVehicleId = typeof body.vehicleId === "string" ? body.vehicleId.trim() : "";
  const hasVehicle = rawVehicleId.length > 0;

  const missionIdRaw = typeof body.missionId === "string" ? body.missionId.trim() : "";
  const routeChangeReasonRaw =
    typeof body.routeChangeReason === "string" ? body.routeChangeReason.trim() : "";
  const rollout = isMultiStopRolloutEnabledServer();

  // Non-company-vehicle transport modes (2026-07): public_transport,
  // third_party, personal_vehicle. Each has a per-org sentinel vehicle so the
  // trips table's NOT NULL vehicle_id / FK is satisfied while the trip is
  // effectively vehicle-less. Downstream consumers (deployments.ts, UI)
  // recognize the sentinel ids and treat the trip accordingly.
  type NonCompanyMode = "public_transport" | "third_party" | "personal_vehicle";
  let missionTransportMode: "company_vehicle" | NonCompanyMode = "company_vehicle";
  if (missionIdRaw) {
    const tmRow = db
      .prepare("SELECT transport_mode FROM missions WHERE id = ?")
      .get(missionIdRaw) as { transport_mode?: string | null } | undefined;
    const tm = String(tmRow?.transport_mode || "company_vehicle").toLowerCase();
    missionTransportMode =
      tm === "public_transport" || tm === "third_party" || tm === "personal_vehicle"
        ? (tm as NonCompanyMode)
        : "company_vehicle";
  }
  const isNonCompanyMission = missionTransportMode !== "company_vehicle";

  const SENTINEL_CODES: Record<NonCompanyMode, string> = {
    public_transport: "PUBLIC-TRANSPORT",
    third_party: "THIRD-PARTY",
    personal_vehicle: "PERSONAL-VEHICLE",
  };
  const SENTINEL_LABELS: Record<NonCompanyMode, string> = {
    public_transport: "(public transport)",
    third_party: "(third-party transport)",
    personal_vehicle: "(personal vehicle)",
  };

  // For non-company-vehicle missions, the trips table still requires a
  // vehicle_id (NOT NULL with FK to vehicles). Use a per-org sentinel vehicle
  // seeded on demand. Downstream consumers recognize these sentinel ids.
  let effectiveVehicleId = rawVehicleId;
  if (isNonCompanyMission && !hasVehicle) {
    const mode = missionTransportMode as NonCompanyMode;
    effectiveVehicleId = `${mode}_${organizationId}`;
    const sentinelExists = db
      .prepare("SELECT 1 FROM vehicles WHERE id = ? LIMIT 1")
      .get(effectiveVehicleId);
    if (!sentinelExists) {
      db.prepare(`
        INSERT OR IGNORE INTO vehicles (
          id, organization_id, code, make, model, license_plate, status,
          registration_disc_expiry_date, asset_class, is_synthetic,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'N/A',
                  'operational', NULL, 'synthetic', 1,
                  datetime('now'), datetime('now'))
      `).run(
        effectiveVehicleId,
        organizationId,
        SENTINEL_CODES[mode],
        SENTINEL_LABELS[mode],
        SENTINEL_LABELS[mode]
      );
    }
  }

  if (!isNonCompanyMission && !hasVehicle) {
    effectiveVehicleId = ensureUnallocatedVehicle(db, organizationId);
  }

  if (!missionIdRaw) {
    return NextResponse.json(
      {
        error: "missionId is required. Every operational trip must be linked to an approved mission.",
      },
      { status: 400 }
    );
  }

  const eligible = assertMissionEligibleForTripCreation(db, organizationId, missionIdRaw);
  if (!eligible.ok) {
    return NextResponse.json({ error: eligible.error, code: eligible.code }, { status: 409 });
  }

  const mission = db
    .prepare("SELECT destination, trip_shape, departure_date, mission_profile FROM missions WHERE id = ?")
    .get(missionIdRaw) as {
      destination?: string;
      trip_shape?: string;
      departure_date?: string;
      mission_profile?: string;
    } | undefined;
  const missionStops = rollout
    ? (db
        .prepare(
          `SELECT location, load_out, load_in, notes
           FROM mission_stops
           WHERE mission_id = ?
           ORDER BY stop_order`
        )
        .all(missionIdRaw) as Array<{ location: string; load_out: string; load_in: string; notes: string }>)
    : [];
  const plannedStops = missionStops.map((s) => ({
    location: String(s.location || "").trim(),
    loadOut: String(s.load_out || "").trim(),
    loadIn: String(s.load_in || "").trim(),
    notes: String(s.notes || "").trim(),
  }));
  const incomingStops = rollout ? normalizeRouteStops(body.stops) : [];
  const stopPlanChanged =
    rollout && plannedStops.length > 0 && !routeStopsEqual(plannedStops, incomingStops);
  if (stopPlanChanged && routeChangeReasonRaw.length < 8) {
    return NextResponse.json(
      {
        error:
          "Route differs from the approved mission plan. Add a route change reason (minimum 8 characters).",
      },
      { status: 400 }
    );
  }

  const resolvedMissionProfile = mission?.mission_profile ?? body.missionProfile ?? "local";
  const resolvedTripShape = rollout
    ? normalizeTripShape(body.tripShape || mission?.trip_shape || "one_way")
    : "one_way";
  const odoStart =
    body.odoStart === undefined || body.odoStart === null || body.odoStart === ""
      ? 0
      : Number(body.odoStart);
  const defaultApprovalStatus = "auto-approved";

  // Transmission derate (EHS): the departing checklist carries the driver
  // identity (checkout itself collects a free-text name). An automatic-only
  // driver may not depart in a manual or unrecorded-transmission vehicle;
  // the pairing is snapshotted onto the trip for the audit trail.
  let driverTransmissionScope = "";
  let vehicleTransmission = "";
  if (!isNonCompanyMission && hasVehicle) {
    const dvcDriver = db
      .prepare(
        `SELECT driver_id FROM driver_vehicle_checks
         WHERE organization_id = ? AND vehicle_id = ? AND direction = 'departing'
         ORDER BY datetime(created_at) DESC LIMIT 1`
      )
      .get(organizationId, effectiveVehicleId) as { driver_id?: string | null } | undefined;
    const dvcDriverId = String(dvcDriver?.driver_id || "").trim();
    if (dvcDriverId) {
      const tg = evaluateTransmissionGate(db, {
        organizationId,
        operatorId: dvcDriverId,
        vehicleId: effectiveVehicleId,
      });
      if (tg.status === "blocked") {
        return NextResponse.json({ error: tg.detail }, { status: 409 });
      }
      driverTransmissionScope = tg.driverScope;
      vehicleTransmission = tg.vehicleTransmission;
    }
  }

  db.prepare(`
    INSERT INTO trips (
      id, organization_id, vehicle_id, driver_id, driver_name, odo_start,
      departure_location, destination, mission_type, mission_profile, trip_shape,
      passengers, load_out, load_in, checkout_at,
      authorized_driver_verified, approved_drivers, loadout_manifest,
      expected_return_at, mission_priority, approval_status, approved_by, am_allocation_ids,
      mission_id, planned_departure_date, driver_transmission_scope, vehicle_transmission
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    organizationId,
    effectiveVehicleId,
    body.driverId || "",
    body.driverName || "",
    odoStart,
    body.departureLocation,
    body.destination,
    body.missionType || "other",
    resolvedMissionProfile,
    resolvedTripShape,
    body.passengers || "",
    body.loadOut || "",
    body.loadIn || "",
    now,
    body.authorizedDriverVerified ? 1 : 0,
    JSON.stringify(body.approvedDrivers || []),
    JSON.stringify(body.loadoutManifest || []),
    body.expectedReturnAt || null,
    body.missionPriority || "normal",
    body.approvalStatus || defaultApprovalStatus,
    body.approvedBy || "",
    JSON.stringify(body.amAllocationIds || []),
    missionIdRaw,
    (mission && String(mission.departure_date || "").slice(0, 10)) || null,
    driverTransmissionScope,
    vehicleTransmission
  );

  db.prepare("UPDATE missions SET trip_id = ?, updated_at = ? WHERE id = ?").run(id, now, missionIdRaw);

  // Insert multi-stop itinerary if provided
  if (incomingStops.length > 0) {
    const stopStmt = db.prepare(`
      INSERT INTO trip_stops (id, trip_id, stop_number, location, load_out, load_in, notes)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
    `);
    for (let i = 0; i < incomingStops.length; i++) {
      const s = incomingStops[i];
      stopStmt.run(id, i + 1, s.location, s.loadOut || "", s.loadIn || "", s.notes || "");
    }
  }

  db.prepare(
    "INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("trip", id, null, "planned", body.driverName || "", now);

  recordMutation(db, {
    entityType: "trip",
    entityId: id,
    organizationId,
    action: "create",
    actor: actorFrom(user),
    after: {
      missionId: missionIdRaw,
      vehicleId: effectiveVehicleId,
      driverName: body.driverName || "",
      destination: body.destination || "",
      departureLocation: body.departureLocation || "",
      allocationStatus: isNonCompanyMission || hasVehicle ? "allocated" : "pending_fleet",
      tripShape: resolvedTripShape,
      stopPlanChanged,
      ...(driverTransmissionScope ? { driverTransmissionScope, vehicleTransmission } : {}),
    },
    reason: stopPlanChanged ? routeChangeReasonRaw : "",
  });

  const trip = db.prepare(`
    SELECT t.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM trips t LEFT JOIN vehicles v ON t.vehicle_id = v.id
    WHERE t.id = ?
  `).get(id);
  return NextResponse.json(trip, { status: 201 });
}
