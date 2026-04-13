import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Distinct filter values for the vehicle list (locations, pool) scoped by org.
 */
export function GET(request: NextRequest): NextResponse {
  try {
    const org = new URL(request.url).searchParams.get("org") || "1pwr_lesotho";
    const db = getDb();

    const currentLocations = (
      db
        .prepare(
          `SELECT DISTINCT current_location AS v FROM vehicles
           WHERE organization_id = ? AND TRIM(COALESCE(current_location, '')) != ''
           ORDER BY v COLLATE NOCASE`
        )
        .all(org) as Array<{ v: string }>
    ).map((r) => r.v);

    const homeLocations = (
      db
        .prepare(
          `SELECT DISTINCT home_location AS v FROM vehicles
           WHERE organization_id = ? AND TRIM(COALESCE(home_location, '')) != ''
           ORDER BY v COLLATE NOCASE`
        )
        .all(org) as Array<{ v: string }>
    ).map((r) => r.v);

    const assetClasses = (
      db
        .prepare(
          `SELECT DISTINCT asset_class AS v FROM vehicles
           WHERE organization_id = ? AND TRIM(COALESCE(asset_class, '')) != ''
           ORDER BY v COLLATE NOCASE`
        )
        .all(org) as Array<{ v: string }>
    ).map((r) => r.v);

    let pools: string[] = [];
    try {
      pools = (
        db
          .prepare(
            `SELECT DISTINCT pool AS v FROM vehicles
             WHERE organization_id = ? AND TRIM(COALESCE(pool, '')) != ''
             ORDER BY v COLLATE NOCASE`
          )
          .all(org) as Array<{ v: string }>
      ).map((r) => r.v);
    } catch {
      pools = [];
    }

    return NextResponse.json({ currentLocations, homeLocations, pools, assetClasses });
  } catch (err) {
    console.error("[api/vehicles/filter-options]", err);
    return NextResponse.json({
      currentLocations: [],
      homeLocations: [],
      pools: [],
      assetClasses: [],
    });
  }
}
