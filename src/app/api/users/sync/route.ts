import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetUser } from "@/lib/server-auth";

/**
 * POST /api/users/sync — propagate IDENTITY fields (email, names, uid link)
 * from the signed-in client into FM's users table.
 *
 * Authority fields (role, department, organization_id, permission_level) are
 * deliberately NOT accepted here. This endpoint used to upsert whatever the
 * client sent, which let the Nexus/PR profile overwrite real fleet roles
 * (manager/driver/…) with PR roles (REQ/USER) on every login — the
 * 2026-07-09 incident. Fleet authority is managed server-side (admin tooling
 * / HR-canonical grants), never from a login-time client payload.
 *
 * The caller must present a valid Firebase bearer token and may only sync
 * their own row (verifyFleetUser resolves — and auto-provisions — that row).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { user: verified } = await verifyFleetUser(req);
    if (!verified) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const body = await req.json();
    const { firebaseUid, email, firstName, lastName, name } = body;

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    // Self-sync only: the payload must describe the verified user.
    const verifiedEmail = (verified.email || "").trim().toLowerCase();
    if (String(email).trim().toLowerCase() !== verifiedEmail) {
      return NextResponse.json({ error: "Can only sync your own profile" }, { status: 403 });
    }

    db.prepare(
      `UPDATE users SET firebase_uid = COALESCE(?, firebase_uid), first_name = ?, last_name = ?, name = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      firebaseUid || null,
      firstName || "",
      lastName || "",
      name || `${firstName || ""} ${lastName || ""}`.trim(),
      verified.id
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/users/sync]", err);
    return NextResponse.json(
      { error: "User sync failed", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
