import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import { evaluateReadinessForMissionLinkedTrip } from "@/lib/mission-deployment-readiness";
import { canOverridePrerequisite } from "@/lib/vehicle-check-approvers";
import { evaluateTrackerDepartureDiscrepancy } from "@/lib/trip-departure";

/**
 * POST /api/trips/[id]/depart
 *
 * Records the actual physical departure moment for a trip that was checked out
 * earlier (often the previous evening). Re-runs the mission-linked readiness
 * gate at departure time so a stale pre-departure checklist (>24h) blocks the
 * wheel-roll unless an approver overrides. Then cross-checks the vehicle's
 * tracker history against the planned departure date and records any
 * discrepancy on the trip row.
 *
 * Supports optional backdating: if the request body includes a `departedAt`
 * ISO string, that value is used for the trip's `departed_at` field instead of
 * the current time. All audit timestamps (updated_at, status_log.changed_at,
 * mutation_log.created_at) always use the actual real-world time so the audit
 * trail records *who* backdated *when*, even though the deployment date itself
 * is in the past.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const db = getDb();
  const trip = db
    .prepare("SELECT * FROM trips WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  if (trip.departed_at) {
    return NextResponse.json(
      {
        error: "This trip has already departed.",
        departedAt: trip.departed_at,
        reason: "already_departed",
      },
      { status: 409 }
    );
  }

  if (trip.checkin_at) {
    return NextResponse.json(
      { error: "This trip has already been checked in and cannot depart.", reason: "already_checked_in" },
      { status: 409 }
    );
  }

  const organizationId = String(trip.organization_id || "1pwr_lesotho");
  const vehicleId = String(trip.vehicle_id || "");
  const missionId = String(trip.mission_id || "");
  const plannedDepartureDate =
    String(trip.planned_departure_date || "").slice(0, 10) || null;

  if (!vehicleId || !missionId) {
    return NextResponse.json(
      { error: "Trip is missing a vehicle or mission link; cannot run the readiness gate.", reason: "missing_link" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // --- Optional backdating ------------------------------------------------
  // If the caller supplies a `departedAt` ISO string, use that as the
  // departure timestamp instead of "now". This lets teams record a
  // departure that happened earlier (e.g. they forgot to click "Start
  // trip" yesterday). The actual-time audit trail is preserved because
  // `updated_at`, `status_log.changed_at`, and `mutation_log.created_at`
  // all use `now` (real time), not the backdated value.
  const backdatedRaw = String(body.departedAt || body.departed_at || "").trim();
  let departedAt = now; // default: real-time departure
  let isBackdated = false;
  if (backdatedRaw) {
    const parsed = new Date(backdatedRaw);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "The provided departure date is not a valid date.", reason: "invalid_departed_at" },
        { status: 400 }
      );
    }
    if (parsed.getTime() > Date.now()) {
      return NextResponse.json(
        { error: "Departure date cannot be in the future.", reason: "future_departed_at" },
        { status: 400 }
      );
    }
    departedAt = parsed.toISOString();
    isBackdated = departedAt !== now;
  }

  const readiness = evaluateReadinessForMissionLinkedTrip(db, {
    organizationId,
    missionId,
    vehicleId,
    checkDate: now.slice(0, 10),
    referenceNow: new Date(now),
  });

  let overrideApplied = false;
  const overrideReason = String(body.overrideReason || "").trim();

  if (!readiness.ok) {
    // The mission_approval gate is policy-hard: vehicles must not be deployed
    // without the mission getting logged and approved. An approver cannot
    // override a non-approved mission — they have to approve the mission
    // first. Other gates (DVC freshness, mechanical, etc.) keep their
    // override path because those are operational checks where a reasoned
    // bypass is legitimate.
    const missionApprovalGate = readiness.gates.find(
      (g) => g.id === "mission_approval" && g.status !== "satisfied"
    );
    if (missionApprovalGate) {
      return NextResponse.json(
        {
          error:
            "Mission is not approved. Approve the mission before departing — this gate cannot be overridden.",
          gates: readiness.gates,
          missionProfile: readiness.missionProfile,
          reason: "mission_not_approved_no_override",
        },
        { status: 403 }
      );
    }
    // mission_lifecycle and mission (not-found) gates are also policy-hard.
    const missionBlocked = String(readiness.missionBlockedReason || "");
    if (missionBlocked && missionBlocked !== "vehicle_mismatch") {
      return NextResponse.json(
        {
          error:
            missionBlocked === "not_found"
              ? "Mission not found for this organization. Dispatch must log a mission before departure."
              : `Mission lifecycle is ${missionBlocked}. Only active missions can deploy — this gate cannot be overridden.`,
          gates: readiness.gates,
          missionProfile: readiness.missionProfile,
          reason: `mission_${missionBlocked}_no_override`,
        },
        { status: 403 }
      );
    }

    if (overrideReason.length === 0) {
      return NextResponse.json(
        {
          error:
            "Trip readiness requirements are not met at departure time. Provide an override reason (an approver can bypass).",
          gates: readiness.gates,
          missionProfile: readiness.missionProfile,
          reason: "readiness_blocked",
        },
        { status: 400 }
      );
    }
    if (!(await canOverridePrerequisite(db, organizationId, user.email, user.role))) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to override the trip readiness gate at departure. Ask a fleet manager or PR-credentialed approver.",
          gates: readiness.gates,
          missionProfile: readiness.missionProfile,
          reason: "no_override_permission",
        },
        { status: 403 }
      );
    }
    if (overrideReason.length < 8) {
      return NextResponse.json(
        {
          error: "Provide a longer override reason (at least 8 characters) so this bypass is auditable.",
          gates: readiness.gates,
          reason: "override_reason_too_short",
        },
        { status: 400 }
      );
    }
    overrideApplied = true;
  }

  const actualOdoRaw = body.actualOdoStart;
  const actualOdoStart =
    actualOdoRaw === undefined || actualOdoRaw === null || actualOdoRaw === ""
      ? null
      : Number(actualOdoRaw);
  const useActualOdo =
    actualOdoStart !== null && Number.isFinite(actualOdoStart) && actualOdoStart >= 0;

  // Tracker cross-check against the planned departure date.
  let discrepancy: ReturnType<typeof evaluateTrackerDepartureDiscrepancy> | null = null;
  if (plannedDepartureDate) {
    discrepancy = evaluateTrackerDepartureDiscrepancy(db, {
      vehicleId,
      plannedDepartureDate,
    });
  }

  const setClauses = [
    "departed_at = ?",
    "departure_confirmed_by_id = ?",
    "departure_confirmed_by_name = ?",
    "departure_discrepancy = ?",
    "updated_at = ?",
  ];
  const setValues: unknown[] = [
    departedAt,
    user.id,
    user.name || user.email,
    discrepancy ? JSON.stringify(discrepancy) : null,
    now, // updated_at always uses actual time
  ];
  if (useActualOdo) {
    setClauses.push("odo_start = ?");
    setValues.push(actualOdoStart);
  }
  setValues.push(id);

  const tx = db.transaction(() => {
    db.prepare(`UPDATE trips SET ${setClauses.join(", ")} WHERE id = ?`).run(...setValues);

    db.prepare(
      `INSERT INTO status_log (entity_type, entity_id, old_status, new_status, changed_by, changed_at, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "trip",
      id,
      "checked-out",
      "departed",
      user.name || user.email,
      now,
      overrideApplied ? `override: ${overrideReason}` : isBackdated ? `backdated to ${departedAt}` : ""
    );
  });
  tx();

  if (overrideApplied) {
    recordMutation(db, {
      entityType: "trip",
      entityId: id,
      organizationId,
      action: "prerequisite_override",
      actor: actorFrom(user),
      after: {
        vehicleId,
        missionId,
        departedAt,
        backdated: isBackdated,
        gatesBypassed: readiness.gates
          .filter((g) => g.status !== "satisfied")
          .map((g) => ({ id: g.id, label: g.label, detail: g.detail })),
        discrepancy: discrepancy
          ? { discrepancy: discrepancy.discrepancy, detail: discrepancy.detail }
          : null,
      },
      reason: overrideReason,
    });
  } else if (isBackdated) {
    recordMutation(db, {
      entityType: "trip",
      entityId: id,
      organizationId,
      action: "backdate_departure",
      actor: actorFrom(user),
      after: {
        vehicleId,
        missionId,
        departedAt,
        actualOdoStart: useActualOdo ? actualOdoStart : undefined,
        discrepancy: discrepancy
          ? { discrepancy: discrepancy.discrepancy, firstMovedAt: discrepancy.firstMovedAt }
          : null,
      },
    });
  } else {
    recordMutation(db, {
      entityType: "trip",
      entityId: id,
      organizationId,
      action: "update",
      actor: actorFrom(user),
      after: {
        vehicleId,
        missionId,
        departedAt,
        actualOdoStart: useActualOdo ? actualOdoStart : undefined,
        discrepancy: discrepancy
          ? { discrepancy: discrepancy.discrepancy, firstMovedAt: discrepancy.firstMovedAt }
          : null,
      },
    });
  }

  const updated = db
    .prepare(
      `SELECT t.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
       FROM trips t LEFT JOIN vehicles v ON t.vehicle_id = v.id
       WHERE t.id = ?`
    )
    .get(id);

  return NextResponse.json({
    ...(updated as Record<string, unknown>),
    departureDiscrepancy: discrepancy,
  });
}
