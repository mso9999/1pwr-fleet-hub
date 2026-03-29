import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildDailyUpdate } from "@/lib/daily-update";

export function GET(request: NextRequest): NextResponse {
  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";
  const dateParam = searchParams.get("date");
  const today = new Date();
  const dateIso =
    dateParam ||
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return NextResponse.json({ error: "Invalid date — use YYYY-MM-DD" }, { status: 400 });
  }

  const db = getDb();
  const result = buildDailyUpdate(db, org, dateIso);
  return NextResponse.json(result);
}
