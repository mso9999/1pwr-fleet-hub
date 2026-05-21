import path from "path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const UPLOAD_ROOT = path.resolve(UPLOAD_DIR);

function isSafePathSegment(s: string): boolean {
  if (!s || s.length > 512) return false;
  if (s.includes("..") || s.includes("/") || s.includes("\\")) return false;
  return /^[a-zA-Z0-9._-]+$/.test(s);
}

/**
 * Stream a file from `public/uploads` after validating `media_attachments`.
 * Used by GET /api/media/file and GET /uploads/… (legacy URL compatibility).
 */
export async function streamMediaAttachmentFile(
  entityType: string,
  entityId: string,
  fileName: string
): Promise<NextResponse> {
  const et = entityType.trim();
  const eid = entityId.trim();
  const fn = fileName.trim();

  if (!et || !eid || !fn) {
    return NextResponse.json({ error: "entityType, entityId, and fileName are required" }, { status: 400 });
  }
  if (!isSafePathSegment(et) || !isSafePathSegment(eid) || !isSafePathSegment(fn)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const db = getDb();
  const row = db
    .prepare(
      "SELECT mime_type, file_name FROM media_attachments WHERE entity_type = ? AND entity_id = ? AND file_name = ?"
    )
    .get(et, eid, fn) as { mime_type: string; file_name: string } | undefined;

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const abs = path.join(UPLOAD_DIR, et, eid, row.file_name);
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(UPLOAD_ROOT + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  if (!existsSync(resolved)) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  const buf = await readFile(resolved);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": row.mime_type || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
