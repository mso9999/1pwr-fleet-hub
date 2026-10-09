import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, isExecutiveRole } from "@/lib/server-auth";
import { isFleetManagementForOrg } from "@/lib/fleet-lead-scope";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import {
  applyApprovedCountryChangeRequest as applyApprovedRequest,
  countryChangeBlockedBySecondment,
  orgCountryCode,
} from "@/lib/vehicle-secondment";
import { pushVehicleRowToPr } from "@/lib/pr-vehicle-sync";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: requestId } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM vehicle_country_change_requests WHERE id = ?").get(requestId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const vehicleId = row.vehicle_id as string;
  const vehicleBefore = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId) as
    | Record<string, unknown>
    | undefined;

  const status = row.status as string;
  if (status !== "pending_fleet" && status !== "pending_executive") {
    return NextResponse.json({ error: "Request is not awaiting approval" }, { status: 400 });
  }

  const kind = row.change_kind as string;
  const now = new Date().toISOString();

  // Re-check at approval time: the vehicle may have been seconded since this was filed.
  if (vehicleBefore) {
    const secondedErr = countryChangeBlockedBySecondment(
      vehicleBefore,
      kind,
      orgCountryCode(db, vehicleBefore.seconded_to_org as string | null)
    );
    if (secondedErr) {
      return NextResponse.json({ error: secondedErr, reason: "already_seconded" }, { status: 409 });
    }
  }

  if (status === "pending_fleet") {
    if (kind !== "data_correction") {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }
    const fromOrg = String(row.from_organization_id || vehicleBefore?.organization_id || "");
    if (!isFleetManagementForOrg(db, fromOrg, user)) {
      return NextResponse.json({ error: "Fleet lead, manager, or admin role required" }, { status: 403 });
    }
    const runFleet = db.transaction(() => {
      applyApprovedRequest(
        db,
        requestId,
        row,
        actorFrom(user),
        user.id,
        user.name,
        now,
        { kind: "fleet" }
      );
    });
    runFleet();
  } else {
    if (kind === "data_correction") {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }
    if (!isExecutiveRole(user.role)) {
      return NextResponse.json({ error: "C-level / executive sign-off required" }, { status: 403 });
    }
    const runExec = db.transaction(() => {
      applyApprovedRequest(
        db,
        requestId,
        row,
        actorFrom(user),
        user.id,
        user.name,
        now,
        { kind: "executive" }
      );
    });
    runExec();
  }

  const toOrg = String(row.to_organization_id ?? "");
  const fromOrg = String(vehicleBefore?.organization_id ?? "");
  const orgId = fromOrg || toOrg;

  recordMutation(db, {
    entityType: "vehicle_country_change_request",
    entityId: requestId,
    organizationId: orgId,
    action: "approve",
    actor: actorFrom(user),
    before: {
      status: row.status,
      change_kind: row.change_kind,
      from_organization_id: row.from_organization_id,
      to_organization_id: row.to_organization_id,
    },
    after: { status: "approved", vehicleId, toOrganizationId: toOrg, ownerChanged: kind !== "secondment" },
  });

  // The vehicle-row mutation entry is written by applySecondmentStart / applyOwnershipMove.
  const vehicleAfter = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId) as
    | Record<string, unknown>
    | undefined;
  if (vehicleAfter) await pushVehicleRowToPr(vehicleAfter);

  const updated = db.prepare("SELECT * FROM vehicle_country_change_requests WHERE id = ?").get(requestId);
  return NextResponse.json(updated);
}
