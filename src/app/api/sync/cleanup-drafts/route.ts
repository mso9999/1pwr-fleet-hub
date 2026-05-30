import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";

function hasCronSecret(req: NextRequest): boolean {
  const expected = String(process.env.DRAFT_CLEANUP_SECRET || "").trim();
  if (!expected) return false;
  const provided = req.headers.get("x-api-key")?.trim() || req.nextUrl.searchParams.get("key")?.trim() || "";
  return provided !== "" && provided === expected;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(req);
  const authorizedByRole = !!user && (user.role === "admin" || user.role === "superadmin");
  if (!authorizedByRole && !hasCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const missionDelete = db.prepare(
    `DELETE FROM missions
     WHERE lower(COALESCE(approval_status, '')) = 'draft'
       AND datetime(created_at) <= datetime('now', '-30 days')`
  );
  const tripDelete = db.prepare(
    `DELETE FROM trip_drafts
     WHERE lower(COALESCE(status, 'draft')) = 'draft'
       AND datetime(created_at) <= datetime('now', '-30 days')`
  );
  const tx = db.transaction(() => {
    const missionResult = missionDelete.run();
    const tripResult = tripDelete.run();
    return {
      deletedMissionDrafts: missionResult.changes,
      deletedTripDrafts: tripResult.changes,
    };
  });
  const result = tx();
  return NextResponse.json({
    success: true,
    ...result,
    ranAt: new Date().toISOString(),
  });
}
