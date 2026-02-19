import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { writeFile, mkdir } from "fs/promises";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export function GET(request: NextRequest): NextResponse {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || "1pwr_lesotho";
  const status = searchParams.get("status");

  let query = `
    SELECT r.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM field_issue_reports r
    JOIN vehicles v ON r.vehicle_id = v.id
    WHERE r.organization_id = ?
  `;
  const params: unknown[] = [org];

  if (status) {
    query += " AND r.status = ?";
    params.push(status);
  }

  query += " ORDER BY r.created_at DESC LIMIT 100";

  const reports = db.prepare(query).all(...params);

  // Attach photo count from media_attachments
  const getMedia = db.prepare(
    "SELECT * FROM media_attachments WHERE entity_type = 'field_report' AND entity_id = ? ORDER BY created_at ASC"
  );

  const result = (reports as Array<Record<string, unknown>>).map((r) => ({
    ...r,
    photos: getMedia.all(r.id as string),
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const db = getDb();
    const formData = await request.formData();

    const vehicleId = formData.get("vehicleId") as string;
    const title = formData.get("title") as string;

    if (!vehicleId || !title) {
      return NextResponse.json({ error: "vehicleId and title are required" }, { status: 400 });
    }

    const vehicle = db.prepare("SELECT id, organization_id FROM vehicles WHERE id = ?").get(vehicleId) as
      | { id: string; organization_id: string }
      | undefined;
    if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });

    const reportId = uuidv4();
    const description = (formData.get("description") as string) || "";
    const severity = (formData.get("severity") as string) || "medium";
    const location = (formData.get("location") as string) || "";
    const odometer = formData.get("odometer") ? Number(formData.get("odometer")) : null;
    const isDriveable = formData.get("isDriveable") === "false" ? 0 : 1;
    const reportedById = (formData.get("reportedById") as string) || "";
    const reportedByName = (formData.get("reportedByName") as string) || "";

    // Handle photo uploads
    const files = formData.getAll("photos") as File[];
    const validFiles = files.filter((f) => f.size > 0);
    let photoCount = 0;

    if (validFiles.length > 0) {
      const subDir = path.join(UPLOAD_DIR, "field_report", reportId);
      await mkdir(subDir, { recursive: true });

      for (const file of validFiles) {
        const mediaId = uuidv4();
        const ext = path.extname(file.name) || "";
        const safeFileName = `${mediaId}${ext}`;

        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(path.join(subDir, safeFileName), buffer);

        db.prepare(`
          INSERT INTO media_attachments (id, entity_type, entity_id, file_name, original_name, mime_type, size_bytes, caption, category, uploaded_by_id, uploaded_by_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(mediaId, "field_report", reportId, safeFileName, file.name, file.type, file.size, "", "damage", reportedById, reportedByName);

        photoCount++;
      }
    }

    db.prepare(`
      INSERT INTO field_issue_reports (id, organization_id, vehicle_id, reported_by_id, reported_by_name, title, description, severity, location, odometer, is_driveable, photo_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(reportId, vehicle.organization_id, vehicleId, reportedById, reportedByName, title, description, severity, location, odometer, isDriveable, photoCount);

    const report = db.prepare(
      "SELECT r.*, v.code as vehicle_code FROM field_issue_reports r JOIN vehicles v ON r.vehicle_id = v.id WHERE r.id = ?"
    ).get(reportId);

    return NextResponse.json(report, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
