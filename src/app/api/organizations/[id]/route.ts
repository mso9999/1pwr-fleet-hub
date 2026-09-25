import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";
import { DEFAULT_FUEL_SAFETY_FACTOR } from "@/lib/fuel-calculator";

/** PATCH org route origin and/or fuel defaults — managers+ */
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
  const db = getDb();
  const before = db
    .prepare(
      `SELECT id, route_origin_lat, route_origin_lng, currency, fuel_safety_factor, fuel_default_pump_price
       FROM organizations WHERE id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  const after: Record<string, unknown> = {};

  if (body.routeOriginLat !== undefined || body.routeOriginLng !== undefined) {
    const lat = body.routeOriginLat;
    const lng = body.routeOriginLng;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: "routeOriginLat and routeOriginLng must be numbers" },
        { status: 400 }
      );
    }
    fields.push("route_origin_lat = ?", "route_origin_lng = ?");
    values.push(lat, lng);
    after.route_origin_lat = lat;
    after.route_origin_lng = lng;
  }

  if (body.fuelSafetyFactor !== undefined) {
    const f = Number(body.fuelSafetyFactor);
    if (!Number.isFinite(f) || f <= 0) {
      return NextResponse.json({ error: "fuelSafetyFactor must be a positive number" }, { status: 400 });
    }
    fields.push("fuel_safety_factor = ?");
    values.push(f);
    after.fuel_safety_factor = f;
  }

  if (body.fuelDefaultPumpPrice !== undefined) {
    if (body.fuelDefaultPumpPrice === null || body.fuelDefaultPumpPrice === "") {
      fields.push("fuel_default_pump_price = NULL");
      after.fuel_default_pump_price = null;
    } else {
      const p = Number(body.fuelDefaultPumpPrice);
      if (!Number.isFinite(p) || p < 0) {
        return NextResponse.json({ error: "fuelDefaultPumpPrice must be a non-negative number" }, { status: 400 });
      }
      fields.push("fuel_default_pump_price = ?");
      values.push(p);
      after.fuel_default_pump_price = p;
    }
  }

  if (body.currency !== undefined) {
    const c = String(body.currency || "").trim().toUpperCase();
    if (!c) {
      return NextResponse.json({ error: "currency required" }, { status: 400 });
    }
    fields.push("currency = ?");
    values.push(c);
    after.currency = c;
  }

  if (fields.length === 0) {
    return NextResponse.json(
      { error: "No fields to update (route origin and/or fuel defaults)" },
      { status: 400 }
    );
  }

  values.push(id);
  db.prepare(`UPDATE organizations SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  recordMutation(db, {
    entityType: "organization",
    entityId: id,
    organizationId: id,
    action: "update",
    actor: auditActorFrom(user, {}),
    before: {
      route_origin_lat: before.route_origin_lat,
      route_origin_lng: before.route_origin_lng,
      currency: before.currency,
      fuel_safety_factor: before.fuel_safety_factor ?? DEFAULT_FUEL_SAFETY_FACTOR,
      fuel_default_pump_price: before.fuel_default_pump_price,
    },
    after,
  });

  return NextResponse.json({ success: true });
}
