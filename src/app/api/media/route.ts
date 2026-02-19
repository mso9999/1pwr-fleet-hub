import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { writeFile, mkdir } from "fs/promises";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function GET(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const attachments = db.prepare(
    "SELECT * FROM media_attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC"
  ).all(entityType, entityId);

  return NextResponse.json(attachments);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const entityType = formData.get("entityType") as string | null;
    const entityId = formData.get("entityId") as string | null;
    const caption = (formData.get("caption") as string) || "";
    const category = (formData.get("category") as string) || "general";
    const uploadedById = (formData.get("uploadedById") as string) || "";
    const uploadedByName = (formData.get("uploadedByName") as string) || "";

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!entityType || !entityId) {
      return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Max 20MB." }, { status: 400 });
    }

    const db = getDb();
    const id = uuidv4();
    const ext = path.extname(file.name) || "";
    const safeFileName = `${id}${ext}`;

    const subDir = path.join(UPLOAD_DIR, entityType, entityId);
    await mkdir(subDir, { recursive: true });

    const filePath = path.join(subDir, safeFileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    db.prepare(`
      INSERT INTO media_attachments (id, entity_type, entity_id, file_name, original_name, mime_type, size_bytes, caption, category, uploaded_by_id, uploaded_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, entityType, entityId, safeFileName, file.name, file.type, file.size, caption, category, uploadedById, uploadedByName);

    const attachment = db.prepare("SELECT * FROM media_attachments WHERE id = ?").get(id);
    return NextResponse.json(attachment, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = getDb();
  const attachment = db.prepare("SELECT * FROM media_attachments WHERE id = ?").get(id) as {
    entity_type: string;
    entity_id: string;
    file_name: string;
  } | undefined;

  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filePath = path.join(UPLOAD_DIR, attachment.entity_type, attachment.entity_id, attachment.file_name);
  try {
    const { unlink } = await import("fs/promises");
    await unlink(filePath);
  } catch {
    // File may already be deleted — continue with DB cleanup
  }

  db.prepare("DELETE FROM media_attachments WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
