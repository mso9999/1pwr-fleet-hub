import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { syncMissionPrLinksFromFirestore } from "@/lib/firestore-sync";

export const runtime = "nodejs";

function listLinks(db: ReturnType<typeof getDb>, missionId: string) {
  return db
    .prepare(
      `SELECT pr_id, pr_number, pr_status, kind, amount, currency, requestor_name, pr_created_at, synced_at
       FROM mission_pr_links WHERE mission_id = ? ORDER BY pr_created_at`
    )
    .all(missionId);
}

/** GET /api/missions/[id]/pr-links — cached PR-app purchase requests linked to this mission. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({ links: listLinks(getDb(), id) });
}

/**
 * POST /api/missions/[id]/pr-links — READ-ONLY refresh from Firestore
 * (purchaseRequests where fleetMissionId == id), then return the cached links.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM missions WHERE id = ?").get(id);
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await syncMissionPrLinksFromFirestore(id);
  return NextResponse.json(
    { links: listLinks(db, id), sync: result },
    { status: result.success ? 200 : 502 }
  );
}
