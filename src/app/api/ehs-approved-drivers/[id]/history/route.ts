import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  getVerifiedFleetUser,
  canViewEhsApprovedDriversRegister,
} from "@/lib/server-auth";
import { listMutations } from "@/lib/record-mutation-log";

/**
 * GET /api/ehs-approved-drivers/[id]/history
 * Append-only mutation log (create / update / attest / authorization / delete)
 * for a single approved-driver record. Visible to any signed-in user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canViewEhsApprovedDriversRegister(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const rows = listMutations(db, "ehs_approved_driver", id, 200);
  return NextResponse.json({ history: rows });
}
