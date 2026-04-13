import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, isExecutiveRole, isFleetManagementRole } from "@/lib/server-auth";

function applyApprovedRequest(
  db: ReturnType<typeof getDb>,
  requestId: string,
  vehicleId: string,
  toOrganizationId: string,
  signerId: string,
  signerName: string,
  now: string,
  opts: { kind: "fleet" | "executive" }
): void {
  const reviewedId = opts.kind === "fleet" ? signerId : "";
  const reviewedName = opts.kind === "fleet" ? signerName : "";
  const reviewedAt = opts.kind === "fleet" ? now : "";
  const execId = opts.kind === "executive" ? signerId : "";
  const execName = opts.kind === "executive" ? signerName : "";
  const execAt = opts.kind === "executive" ? now : "";

  db.prepare(
    `UPDATE vehicle_country_change_requests SET
      status = 'approved',
      updated_at = ?,
      reviewed_by_id = ?,
      reviewed_by_name = ?,
      reviewed_at = ?,
      executive_signed_by_id = ?,
      executive_signed_by_name = ?,
      executive_signed_at = ?
    WHERE id = ?`
  ).run(now, reviewedId, reviewedName, reviewedAt, execId, execName, execAt, requestId);

  db.prepare("UPDATE vehicles SET organization_id = ?, updated_at = ? WHERE id = ?").run(
    toOrganizationId,
    now,
    vehicleId
  );
}

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

  const status = row.status as string;
  if (status !== "pending_fleet" && status !== "pending_executive") {
    return NextResponse.json({ error: "Request is not awaiting approval" }, { status: 400 });
  }

  const kind = row.change_kind as string;
  const now = new Date().toISOString();

  if (status === "pending_fleet") {
    if (kind !== "data_correction") {
      return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }
    if (!isFleetManagementRole(user.role)) {
      return NextResponse.json({ error: "Fleet lead, manager, or admin role required" }, { status: 403 });
    }
    const runFleet = db.transaction(() => {
      applyApprovedRequest(
        db,
        requestId,
        row.vehicle_id as string,
        row.to_organization_id as string,
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
        row.vehicle_id as string,
        row.to_organization_id as string,
        user.id,
        user.name,
        now,
        { kind: "executive" }
      );
    });
    runExec();
  }

  const updated = db.prepare("SELECT * FROM vehicle_country_change_requests WHERE id = ?").get(requestId);
  return NextResponse.json(updated);
}
