import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";

/** PATCH fleet route origin (map / GPS) — managers+ */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["fleet_lead", "manager", "admin", "finance", "superadmin"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const lat = body.routeOriginLat;
  const lng = body.routeOriginLng;

  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "routeOriginLat and routeOriginLng must be numbers" }, { status: 400 });
  }

  const db = getDb();
  const r = db
    .prepare("UPDATE organizations SET route_origin_lat = ?, route_origin_lng = ? WHERE id = ?")
    .run(lat, lng, id);
  if (r.changes === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
