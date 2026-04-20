import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  getVerifiedFleetUser,
  canManageEhsApprovedDrivers,
} from "@/lib/server-auth";

/**
 * POST /api/ehs-approved-drivers/[id]/attest
 * EHS / admin attestation: sets attested_by_* and attested_at = now() on the operator
 * record. Used right after the user clicks the "I confirm…" checkbox + Attest and save.
 * The PATCH handler always clears attestation on any edit, so this is the one way to
 * bring the record back to "fresh".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canManageEhsApprovedDrivers(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM ehs_approved_drivers WHERE id = ?")
    .get(id) as { id: string } | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE ehs_approved_drivers
     SET attested_by_id = ?, attested_by_name = ?, attested_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(user.id, user.name || user.email, now, now, id);

  return NextResponse.json({ attested_at: now, attested_by_id: user.id, attested_by_name: user.name || user.email });
}
