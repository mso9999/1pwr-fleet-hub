import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, type VerifiedFleetUser } from "@/lib/server-auth";
import {
  findUserByEmail,
  grantFleetLeadScope,
  listFleetLeadScopes,
  revokeFleetLeadScope,
} from "@/lib/fleet-lead-scope";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";

/**
 * Country-scoped fleet-lead grants (user_fleet_lead_scopes). Admin / superadmin only.
 *
 * GET    ?org=…                         list (all orgs when org omitted)
 * POST   { email, organizationId }      grant fleet lead for that org (role unchanged)
 * DELETE ?email=…&org=…                 revoke
 */

function isAdmin(user: VerifiedFleetUser | null): user is VerifiedFleetUser {
  const role = (user?.role || "").toLowerCase();
  return role === "admin" || role === "superadmin";
}

function organizationExists(db: ReturnType<typeof getDb>, organizationId: string): boolean {
  return !!db.prepare("SELECT 1 AS ok FROM organizations WHERE id = ?").get(organizationId);
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Admin or superadmin only" }, { status: user ? 403 : 401 });
  }
  const org = new URL(request.url).searchParams.get("org") || undefined;
  return NextResponse.json({ scopes: listFleetLeadScopes(getDb(), org) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Admin or superadmin only" }, { status: user ? 403 : 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { email?: string; organizationId?: string };
  const organizationId = String(body.organizationId || "").trim();
  const db = getDb();
  const target = findUserByEmail(db, String(body.email || ""));
  if (!target) return NextResponse.json({ error: "No Fleet Hub user with that email" }, { status: 404 });
  if (!organizationId || !organizationExists(db, organizationId)) {
    return NextResponse.json({ error: "Unknown organizationId" }, { status: 400 });
  }
  const inserted = grantFleetLeadScope(db, target.id, organizationId, user.email || user.id);
  if (inserted) {
    recordMutation(db, {
      entityType: "user",
      entityId: target.id,
      organizationId,
      action: "authorization",
      actor: actorFrom(user),
      before: { fleetLeadScope: null },
      after: { fleetLeadScope: organizationId, role: target.role },
      reason: "fleet_lead_scope_grant",
    });
  }
  return NextResponse.json({ granted: inserted, scopes: listFleetLeadScopes(db, organizationId) });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Admin or superadmin only" }, { status: user ? 403 : 401 });
  }
  const params = new URL(request.url).searchParams;
  const organizationId = String(params.get("org") || "").trim();
  const db = getDb();
  const target = findUserByEmail(db, String(params.get("email") || ""));
  if (!target || !organizationId) {
    return NextResponse.json({ error: "email and org are required" }, { status: 400 });
  }
  const removed = revokeFleetLeadScope(db, target.id, organizationId);
  if (removed) {
    recordMutation(db, {
      entityType: "user",
      entityId: target.id,
      organizationId,
      action: "authorization",
      actor: actorFrom(user),
      before: { fleetLeadScope: organizationId, role: target.role },
      after: { fleetLeadScope: null },
      reason: "fleet_lead_scope_revoke",
    });
  }
  return NextResponse.json({ revoked: removed, scopes: listFleetLeadScopes(db, organizationId) });
}
