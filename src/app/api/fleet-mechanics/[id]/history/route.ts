import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  getVerifiedFleetUser,
  canViewFleetMechanicsRegister,
} from "@/lib/server-auth";
import { listMutations } from "@/lib/record-mutation-log";

/**
 * GET /api/fleet-mechanics/[id]/history
 * Returns the append-only mutation log for a single mechanic record. Visible to any
 * signed-in user (same as the register itself) — sensitive / PII fields are stripped
 * before the diff is returned.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canViewFleetMechanicsRegister(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const rows = listMutations(db, "fleet_mechanic", id, 200);
  return NextResponse.json({ history: rows });
}
