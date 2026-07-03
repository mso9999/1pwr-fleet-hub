import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { listUnseenForUser } from "@/lib/whats-new";

/**
 * GET /api/whats-new/unseen
 * Returns the user's un-seen, non-archived What's New entries (newest first).
 * Empty array when there's nothing new — the client uses that to suppress the popup.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const entries = listUnseenForUser(db, { id: user.id, role: user.role });
  return NextResponse.json({ count: entries.length, entries });
}
