import { NextRequest, NextResponse } from "next/server";
import {
  ensureMissionsRowShape,
  ensureMissionsTableAndVehicleRequestMissionId,
  ensureVehiclesCodeColumn,
  getDb,
} from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { insertPlannedMission } from "@/lib/missions";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import { isMultiStopRolloutEnabledServer } from "@/lib/feature-flags";
import { canViewPrivateDraft } from "@/lib/fleet-roles";
import {
  normalizeRouteStops,
  normalizeTripShape,
  validateRoutePlan,
} from "@/lib/trip-route";

export const runtime = "nodejs";

type MissionListRow = Record<string, unknown> & {
  id: string;
};

function withMissionStops(
  db: ReturnType<typeof getDb>,
  rows: MissionListRow[]
): MissionListRow[] {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => String(r.id || ""));
  const placeholders = ids.map(() => "?").join(", ");
  const stopRows = db
    .prepare(
      `SELECT mission_id, stop_order, location, load_out, load_in, notes
       FROM mission_stops
       WHERE mission_id IN (${placeholders})
       ORDER BY mission_id, stop_order`
    )
    .all(...ids) as Array<{
    mission_id: string;
    stop_order: number;
    location: string;
    load_out: string;
    load_in: string;
    notes: string;
  }>;
  const byMission = new Map<string, typeof stopRows>();
  for (const s of stopRows) {
    const arr = byMission.get(s.mission_id) ?? [];
    arr.push(s);
    byMission.set(s.mission_id, arr);
  }
  return rows.map((r) => {
    const stops = byMission.get(String(r.id || "")) ?? [];
    return { ...r, stops, stop_count: stops.length };
  });
}

/**
 * Planned missions (trip shells) — linked from vehicle requests before an operational trip checkout exists.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch (e) {
    console.error("[api/missions GET] getDb failed", e);
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const user = await getVerifiedFleetUser(request);
  db.prepare(
    `DELETE FROM missions
     WHERE lower(COALESCE(approval_status, '')) = 'draft'
       AND datetime(created_at) <= datetime('now', '-30 days')`
  ).run();

  const status = request.nextUrl.searchParams.get("status") ?? "planned";
  const approvalStatus = request.nextUrl.searchParams.get("approvalStatus");
  const tripCheckoutEligible = request.nextUrl.searchParams.get("tripCheckoutEligible") === "true";

  let sql = `
    SELECT m.id, m.organization_id, m.title, m.destination, m.departure_date, m.return_date, m.mission_type,
           m.passengers, m.crew_size, m.personnel_manifest, m.loadout_summary, m.notes, m.status, m.trip_id,
           m.approval_status, m.approved_by_name, m.approved_at, m.rejection_reason,
           m.mission_profile, m.trip_shape, m.required_vehicle_class, m.assigned_vehicle_id, m.rr_status,
           m.assigned_at, m.assigned_by_name, m.lifecycle_status,
           m.created_by_id, m.created_by_name, m.created_at, m.updated_at,
           v.code AS assigned_vehicle_code
    FROM missions m
    LEFT JOIN vehicles v ON m.assigned_vehicle_id = v.id
    WHERE m.organization_id = ?
  `;
  const params: string[] = [org];

  if (status !== "all") {
    /** Must qualify: `vehicles` also has `status` — unqualified `status` errors with LEFT JOIN. */
    sql += " AND m.status = ?";
    params.push(status);
  }

  if (approvalStatus && approvalStatus !== "all") {
    sql += " AND lower(m.approval_status) = lower(?)";
    params.push(approvalStatus);
  }

  if (tripCheckoutEligible) {
    sql += ` AND lower(COALESCE(m.approval_status,'')) = 'approved'
             AND lower(COALESCE(m.lifecycle_status,'active')) = 'active'
             AND trim(COALESCE(m.assigned_vehicle_id,'')) != ''
             AND (
               m.trip_id IS NULL
               OR EXISTS (SELECT 1 FROM trips t WHERE t.id = m.trip_id AND t.checkin_at IS NOT NULL)
             )
    `;
  }

  sql += " ORDER BY m.departure_date DESC, m.created_at DESC LIMIT 200";

  /** Re-run DDL alignments if ensurePhase1Schema failed mid-flight on a prior request (common with SQLite). */
  function repairListSchema(): void {
    try {
      ensureMissionsTableAndVehicleRequestMissionId(db);
    } catch (err) {
      console.error("[api/missions GET] ensureMissionsTableAndVehicleRequestMissionId", err);
    }
    try {
      ensureMissionsRowShape(db);
      ensureVehiclesCodeColumn(db);
    } catch (err) {
      console.error("[api/missions GET] ensureMissionsRowShape / ensureVehiclesCodeColumn", err);
    }
  }

  const execList = () => db.prepare(sql).all(...params);

  try {
    const rows = withMissionStops(db, execList() as MissionListRow[]).filter((row) => {
      const approval = String(row.approval_status || "").toLowerCase();
      if (approval !== "draft") return true;
      if (!user) return false;
      return canViewPrivateDraft({
        role: user.role,
        department: user.department,
        isCreator: String(row.created_by_id || "") === user.id,
      });
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[api/missions GET] first attempt", { org, status, approvalStatus, tripCheckoutEligible, err: e });
    /** Schema drift / partial migrations only — fixed queries like `m.status` do not need this. */
    repairListSchema();
    try {
      const rows = withMissionStops(db, execList() as MissionListRow[]).filter((row) => {
        const approval = String(row.approval_status || "").toLowerCase();
        if (approval !== "draft") return true;
        if (!user) return false;
        return canViewPrivateDraft({
          role: user.role,
          department: user.department,
          isCreator: String(row.created_by_id || "") === user.id,
        });
      });
      return NextResponse.json(rows);
    } catch (e2) {
      const message = e2 instanceof Error ? e2.message : String(e2);
      console.error("[api/missions GET] after schema repair", {
        org,
        status,
        approvalStatus,
        tripCheckoutEligible,
        err: e2,
      });
      return NextResponse.json(
        {
          error: "Failed to load missions",
          /** Truncated SQLite/better-sqlite3 message — needed when production hides server logs from the browser. */
          detail: message.slice(0, 400),
        },
        { status: 500 }
      );
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const intent = String(body.action || body.intent || "submit").toLowerCase();
  const initialApprovalStatus = intent === "savedraft" || intent === "save_draft" || intent === "draft"
    ? "draft"
    : "pending";
  const organizationId = String(body.organizationId || "1pwr_lesotho");
  const db = getDb();
  const rollout = isMultiStopRolloutEnabledServer();
  const tripShape = rollout ? normalizeTripShape(body.tripShape) : "one_way";
  const stops = rollout ? normalizeRouteStops(body.stops) : [];
  const destination = String(body.destination || "").trim();
  const routeValidationError = validateRoutePlan({ tripShape, destination, stops });
  if (routeValidationError) {
    return NextResponse.json({ error: routeValidationError }, { status: 400 });
  }

  // Enforce a numeric crew size — the mission is the canonical source of "how many people"
  // for downstream consumers (e.g. PR field-camp provisioning). Free-text passengers is
  // retained as optional names/notes only.
  const crewSizeRaw = body.crewSize === undefined ? body.crew_size : body.crewSize;
  const crewParsed = parseInt(String(crewSizeRaw ?? ""), 10);
  if (!Number.isFinite(crewParsed) || crewParsed < 1) {
    return NextResponse.json(
      { error: "Crew size is required and must be a whole number of at least 1." },
      { status: 400 }
    );
  }
  const personnelManifest = Array.isArray(body.personnelManifest) ? body.personnelManifest : [];

  // Scenario B: public-transport missions. The team travels by public
  // transport instead of a 1PWR vehicle (e.g. no vehicles available).
  // Requires management approval (already gated by approval_status flow)
  // and a written justification of at least 20 characters.
  const transportModeRaw = String(body.transportMode || body.transport_mode || "company_vehicle").toLowerCase();
  const transportMode: "company_vehicle" | "public_transport" =
    transportModeRaw === "public_transport" ? "public_transport" : "company_vehicle";
  const publicTransportJustification = String(
    body.publicTransportJustification || body.public_transport_justification || "",
  ).trim();
  if (transportMode === "public_transport") {
    if (publicTransportJustification.length < 20) {
      return NextResponse.json(
        {
          error:
            "Public-transport missions require a justification of at least 20 characters (e.g. 'no vehicles available for this date range').",
          field: "publicTransportJustification",
        },
        { status: 400 },
      );
    }
  }

  const id = insertPlannedMission(db, {
    organizationId,
    title: String(body.title || ""),
    destination,
    departureDate: String(body.departureDate || ""),
    returnDate: String(body.returnDate || ""),
    missionType: String(body.missionType || "other"),
    passengers: String(body.passengers || ""),
    crewSize: crewParsed,
    personnelManifest,
    loadoutSummary: String(body.loadoutSummary || ""),
    notes: String(body.notes || ""),
    createdById: user.id,
    createdByName: user.name || user.email,
    missionProfile: String(body.missionProfile || "local"),
    tripShape,
    stops,
    requiredVehicleClass: String(body.requiredVehicleClass || ""),
    rrStatus: String(body.rrStatus || "na"),
    transportMode,
    publicTransportJustification,
    initialApprovalStatus,
  });

  const row = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Record<string, unknown>;
  recordMutation(db, {
    entityType: "mission",
    entityId: id,
    organizationId,
    action: "create",
    actor: actorFrom(user),
    after: {
      title: row.title,
      destination: row.destination,
      departure_date: row.departure_date,
      mission_profile: row.mission_profile,
      trip_shape: row.trip_shape,
      required_vehicle_class: row.required_vehicle_class,
      crew_size: row.crew_size,
      personnel_manifest_count: Array.isArray(personnelManifest) ? personnelManifest.length : 0,
      stop_count: stops.length,
    },
  });
  return NextResponse.json(row, { status: 201 });
}
