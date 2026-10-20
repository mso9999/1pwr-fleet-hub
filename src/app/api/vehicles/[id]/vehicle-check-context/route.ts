import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { getVehiclePrefillContext } from "@/lib/vehicle-check-context";

/** GET /api/vehicles/[id]/vehicle-check-context: last check + odometer prefill for the Driver Vehicle Check form. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const org = new URL(request.url).searchParams.get("org") || user.organizationId;
  const ctx = getVehiclePrefillContext(getDb(), { organizationId: org, vehicleId: id });
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(ctx);
}
