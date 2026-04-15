import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export function GET(): NextResponse {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, name, code, country, currency, route_origin_lat, route_origin_lng FROM organizations WHERE active = 1 ORDER BY name"
    )
    .all() as Array<{
      id: string;
      name: string;
      code: string;
      country: string;
      currency: string;
      route_origin_lat: number | null;
      route_origin_lng: number | null;
    }>;
  return NextResponse.json(rows);
}
