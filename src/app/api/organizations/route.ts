import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export function GET(): NextResponse {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, name, code, country, currency FROM organizations WHERE active = 1 ORDER BY name")
    .all() as Array<{ id: string; name: string; code: string; country: string; currency: string }>;
  return NextResponse.json(rows);
}
