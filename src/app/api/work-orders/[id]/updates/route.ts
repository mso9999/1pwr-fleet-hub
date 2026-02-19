import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();

  const wo = db.prepare("SELECT id FROM work_orders WHERE id = ?").get(id);
  if (!wo) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

  const updates = db.prepare(
    "SELECT * FROM work_order_updates WHERE work_order_id = ? ORDER BY created_at DESC"
  ).all(id);

  // Attach media for each update
  const getMedia = db.prepare(
    "SELECT * FROM media_attachments WHERE entity_type = 'work_order_update' AND entity_id = ? ORDER BY created_at ASC"
  );

  const result = (updates as Array<Record<string, unknown>>).map((u) => ({
    ...u,
    photos: getMedia.all(u.id as string),
  }));

  return NextResponse.json(result);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();

  const wo = db.prepare("SELECT id FROM work_orders WHERE id = ?").get(id);
  if (!wo) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

  const formData = await request.formData();
  const note = (formData.get("note") as string) || "";
  const updateType = (formData.get("updateType") as string) || "progress";
  const postedById = (formData.get("postedById") as string) || "";
  const postedByName = (formData.get("postedByName") as string) || "";

  if (!note.trim()) {
    return NextResponse.json({ error: "Note is required" }, { status: 400 });
  }

  const updateId = uuidv4();
  const files = formData.getAll("photos") as File[];
  const validFiles = files.filter((f) => f.size > 0);

  const { writeFile, mkdir } = await import("fs/promises");
  const path = await import("path");
  const uploadDir = path.join(process.cwd(), "public", "uploads", "work_order_update", updateId);

  let photoCount = 0;

  if (validFiles.length > 0) {
    await mkdir(uploadDir, { recursive: true });

    for (const file of validFiles) {
      const mediaId = uuidv4();
      const ext = path.extname(file.name) || "";
      const safeFileName = `${mediaId}${ext}`;

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadDir, safeFileName), buffer);

      db.prepare(`
        INSERT INTO media_attachments (id, entity_type, entity_id, file_name, original_name, mime_type, size_bytes, caption, category, uploaded_by_id, uploaded_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(mediaId, "work_order_update", updateId, safeFileName, file.name, file.type, file.size, "", "progress", postedById, postedByName);

      photoCount++;
    }
  }

  db.prepare(`
    INSERT INTO work_order_updates (id, work_order_id, update_type, note, posted_by_id, posted_by_name, has_photos, photo_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(updateId, id, updateType, note, postedById, postedByName, photoCount > 0 ? 1 : 0, photoCount);

  const update = db.prepare("SELECT * FROM work_order_updates WHERE id = ?").get(updateId) as Record<string, unknown>;
  const photos = db.prepare(
    "SELECT * FROM media_attachments WHERE entity_type = 'work_order_update' AND entity_id = ?"
  ).all(updateId);

  return NextResponse.json({ ...update, photos }, { status: 201 });
}
