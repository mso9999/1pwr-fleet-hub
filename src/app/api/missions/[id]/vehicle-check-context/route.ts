import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { getVehicleCheckContext } from "@/lib/vehicle-check-context";

/** GET /api/missions/[id]/vehicle-check-context: read-only prefill data for the Driver Vehicle Check form. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  // Org selected in the UI (sidebar), like other ?org= read endpoints; falls back to the user's home org.
  const org = new URL(request.url).searchParams.get("org") || user.organizationId;
  const ctx = getVehicleCheckContext(getDb(), { organizationId: org, missionId: id });
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(ctx);
}
