import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { markSeenForUser } from "@/lib/whats-new";

/**
 * POST /api/whats-new/dismiss
 * Body: { slugs: string[] }
 * Marks the given entry slugs as seen for the current user (idempotent).
 * Called when the user closes the popup or advances past the last page.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { slugs?: unknown };
  try {
    body = (await request.json()) as { slugs?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const slugsRaw = Array.isArray(body.slugs) ? body.slugs : [];
  const slugs = slugsRaw.filter((s): s is string => typeof s === "string" && !!s.trim());
  if (slugs.length === 0) {
    return NextResponse.json({ error: "slugs must be a non-empty array of strings" }, { status: 400 });
  }
  const db = getDb();
  const result = markSeenForUser(db, user.id, slugs);
  return NextResponse.json({ ok: true, recorded: result.recorded });
}
