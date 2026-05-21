import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";
import { MEDIA_CATEGORY } from "@/types";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { writeFile, mkdir } from "fs/promises";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const ENTITY_TYPE = "trip_odo_reading";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: tripId } = await params;
  const org = new URL(request.url).searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();

  const trip = db.prepare("SELECT id, organization_id FROM trips WHERE id = ?").get(tripId) as
    | { id: string; organization_id: string }
    | undefined;
  if (!trip || trip.organization_id !== org) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = db
    .prepare(
      `SELECT r.id, r.trip_id, r.organization_id, r.odo_km, r.notes, r.recorded_at, r.recorded_by_id, r.recorded_by_name, r.created_at,
              (SELECT m.id FROM media_attachments m WHERE m.entity_type = ? AND m.entity_id = r.id LIMIT 1) AS media_id,
              (SELECT m.file_name FROM media_attachments m WHERE m.entity_type = ? AND m.entity_id = r.id LIMIT 1) AS media_file_name,
              (SELECT m.mime_type FROM media_attachments m WHERE m.entity_type = ? AND m.entity_id = r.id LIMIT 1) AS media_mime_type
       FROM trip_odometer_readings r
       WHERE r.trip_id = ?
       ORDER BY r.recorded_at DESC, r.created_at DESC`
    )
    .all(ENTITY_TYPE, ENTITY_TYPE, ENTITY_TYPE, tripId) as Array<Record<string, unknown>>;

  return NextResponse.json(rows);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tripId } = await params;
  const db = getDb();

  const trip = db
    .prepare("SELECT id, organization_id, odo_start, checkin_at FROM trips WHERE id = ?")
    .get(tripId) as { id: string; organization_id: string; odo_start: number; checkin_at: string | null } | undefined;

  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }
  if (trip.checkin_at) {
    return NextResponse.json({ error: "Trip is already checked in; odometer log is closed." }, { status: 400 });
  }

  const formData = await request.formData();
  const orgFromClient = (formData.get("organizationId") as string) || "";
  if (orgFromClient !== trip.organization_id) {
    return NextResponse.json({ error: "Organization mismatch" }, { status: 403 });
  }

  const odoRaw = formData.get("odoKm");
  const odoKm = typeof odoRaw === "string" ? parseInt(odoRaw, 10) : NaN;
  if (!Number.isFinite(odoKm) || odoKm < 0) {
    return NextResponse.json({ error: "Valid odoKm is required" }, { status: 400 });
  }
  if (odoKm < trip.odo_start) {
    return NextResponse.json(
      { error: `Odometer must be at least trip start (${trip.odo_start.toLocaleString()} km).` },
      { status: 400 }
    );
  }

  const notes = String(formData.get("notes") ?? "").slice(0, 2000);
  const recordedAtRaw = (formData.get("recordedAt") as string) || "";
  const recordedAt = recordedAtRaw.trim()
    ? new Date(recordedAtRaw).toISOString()
    : new Date().toISOString();
  if (Number.isNaN(Date.parse(recordedAt))) {
    return NextResponse.json({ error: "Invalid recordedAt" }, { status: 400 });
  }

  const recordedById = (formData.get("recordedById") as string) || user.id;
  const recordedByName = (formData.get("recordedByName") as string) || user.name || user.email || "";

  const readingId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO trip_odometer_readings (id, trip_id, organization_id, odo_km, notes, recorded_at, recorded_by_id, recorded_by_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(readingId, tripId, trip.organization_id, odoKm, notes, recordedAt, recordedById, recordedByName, now);

  const file = formData.get("photo") as File | null;
  if (file && file.size > 0) {
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Photo too large (max 20MB)" }, { status: 400 });
    }
    const mediaId = uuidv4();
    const ext = path.extname(file.name) || "";
    const safeFileName = `${mediaId}${ext}`;
    const subDir = path.join(UPLOAD_DIR, ENTITY_TYPE, readingId);
    await mkdir(subDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(subDir, safeFileName), buffer);

    db.prepare(
      `INSERT INTO media_attachments (id, entity_type, entity_id, file_name, original_name, mime_type, size_bytes, caption, category, uploaded_by_id, uploaded_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      mediaId,
      ENTITY_TYPE,
      readingId,
      safeFileName,
      file.name,
      file.type || "application/octet-stream",
      file.size,
      "",
      MEDIA_CATEGORY.TRIP_ODO,
      recordedById,
      recordedByName
    );
  }

  const row = db
    .prepare(
      `SELECT r.id, r.trip_id, r.organization_id, r.odo_km, r.notes, r.recorded_at, r.recorded_by_id, r.recorded_by_name, r.created_at,
              (SELECT m.id FROM media_attachments m WHERE m.entity_type = ? AND m.entity_id = r.id LIMIT 1) AS media_id,
              (SELECT m.file_name FROM media_attachments m WHERE m.entity_type = ? AND m.entity_id = r.id LIMIT 1) AS media_file_name,
              (SELECT m.mime_type FROM media_attachments m WHERE m.entity_type = ? AND m.entity_id = r.id LIMIT 1) AS media_mime_type
       FROM trip_odometer_readings r
       WHERE r.id = ?`
    )
    .get(ENTITY_TYPE, ENTITY_TYPE, ENTITY_TYPE, readingId) as Record<string, unknown>;

  recordMutation(db, {
    entityType: "trip",
    entityId: tripId,
    organizationId: trip.organization_id,
    action: "update",
    actor: auditActorFrom(user, { id: recordedById, name: recordedByName }),
    after: {
      tripOdometerReadingId: readingId,
      odoKm,
      recordedAt,
      hasPhoto: Boolean(file && file.size > 0),
    },
  });

  return NextResponse.json(row, { status: 201 });
}
