import { NextRequest, NextResponse } from "next/server";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { listAllEntries } from "@/lib/whats-new";

/**
 * GET /api/whats-new[?includeArchived=true]
 * Returns ALL What's New entries (newest first) for the archive view — the
 * companion to the guide/tutorial. Default includes archived entries so the
 * full history is browsable. Pass includeArchived=false to get only the
 * "fresh" set.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") !== "false";
  const entries = listAllEntries(includeArchived);
  return NextResponse.json({ count: entries.length, entries });
}
