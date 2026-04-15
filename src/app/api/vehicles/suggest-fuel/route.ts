import { NextRequest, NextResponse } from "next/server";
import { suggestFuelLPer100km, lPer100kmToUsMpg } from "@/lib/vehicle-fuel-lookup";

/** GET /api/vehicles/suggest-fuel?make=&model=&year= */
export function GET(request: NextRequest): NextResponse {
  const sp = request.nextUrl.searchParams;
  const make = sp.get("make") || "";
  const model = sp.get("model") || "";
  const year = sp.get("year") ? parseInt(sp.get("year")!, 10) : null;

  const sug = suggestFuelLPer100km(make, model, year);
  if (!sug) {
    return NextResponse.json({ lPer100km: null, mpgUs: null, note: null });
  }
  return NextResponse.json({
    lPer100km: sug.lPer100km,
    mpgUs: lPer100kmToUsMpg(sug.lPer100km),
    note: sug.note,
  });
}
