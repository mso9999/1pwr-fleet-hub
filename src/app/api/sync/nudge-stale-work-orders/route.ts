import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { hasFleetAction } from "@/lib/fleet-authz";
import { runStaleWoNudge } from "@/lib/stale-work-orders";

/**
 * POST /api/sync/nudge-stale-work-orders
 * Finds open work orders with no movement in STALE_WO_DAYS (default 3) and
 * nudges the fleet team: assignee emails, supervisor digest, WhatsApp digest
 * to the org's fleet group. Runs from the weekday GitHub Actions cron;
 * admins can also trigger it in-app. Optional body/query: { org, staleDays }.
 */
function hasCronSecret(req: NextRequest): boolean {
  const expected = String(process.env.DRAFT_CLEANUP_SECRET || "").trim();
  if (!expected) return false;
  const provided =
    req.headers.get("x-api-key")?.trim() || req.nextUrl.searchParams.get("key")?.trim() || "";
  return provided !== "" && provided === expected;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(req);
  const authorizedByRole = !!user && hasFleetAction(user, "administer_fleet");
  if (!authorizedByRole && !hasCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { org?: string; staleDays?: number };
  const staleDays = Math.max(
    1,
    Number(body.staleDays || req.nextUrl.searchParams.get("staleDays") || process.env.STALE_WO_DAYS || "3") || 3,
  );

  const db = getDb();
  const orgs = body.org
    ? [body.org]
    : (db.prepare("SELECT id FROM organizations").all() as Array<{ id: string }>).map((r) => r.id);

  const results = [];
  for (const orgId of orgs) {
    results.push(await runStaleWoNudge(db, orgId, staleDays));
  }

  return NextResponse.json({
    success: true,
    staleDays,
    results,
    ranAt: new Date().toISOString(),
  });
}
