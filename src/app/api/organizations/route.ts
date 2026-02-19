import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM organizations WHERE active = 1 ORDER BY name").all();
  return NextResponse.json(rows);
}
