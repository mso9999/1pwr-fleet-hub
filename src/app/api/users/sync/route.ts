import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const body = await req.json();
  const { firebaseUid, email, firstName, lastName, name, role, department, organizationId, permissionLevel, isActive } = body;

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const normalizedOrgId = (organizationId || "1pwr_lesotho").toLowerCase().replace(/\s+/g, "_");

  const existing = db.prepare("SELECT id FROM users WHERE firebase_uid = ? OR email = ?").get(firebaseUid || "", email);

  if (existing) {
    db.prepare(`
      UPDATE users SET firebase_uid = ?, email = ?, first_name = ?, last_name = ?, name = ?, role = ?, department = ?, organization_id = ?, permission_level = ?, is_active = ?, updated_at = datetime('now')
      WHERE firebase_uid = ? OR email = ?
    `).run(
      firebaseUid || null, email, firstName || "", lastName || "", name || `${firstName || ""} ${lastName || ""}`.trim(),
      role || "driver", department || "", normalizedOrgId, permissionLevel || 5, isActive !== false ? 1 : 0,
      firebaseUid || "", email
    );
  } else {
    db.prepare(`
      INSERT INTO users (id, firebase_uid, email, first_name, last_name, name, role, department, organization_id, permission_level, is_active)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      firebaseUid || null, email, firstName || "", lastName || "", name || `${firstName || ""} ${lastName || ""}`.trim(),
      role || "driver", department || "", normalizedOrgId, permissionLevel || 5, isActive !== false ? 1 : 0
    );
  }

  return NextResponse.json({ success: true });
}
