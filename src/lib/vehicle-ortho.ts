import type Database from "better-sqlite3";
import { MEDIA_CATEGORY } from "@/types";
import { mediaAttachmentFileUrl } from "@/lib/media-file-url";

/**
 * Keep vehicles.photo_url pointed at the latest canonical ortho attachment.
 * Called after media create/delete when the entity is a vehicle.
 */
export function syncVehicleOrthoPhotoUrl(db: Database.Database, vehicleId: string): void {
  const id = String(vehicleId || "").trim();
  if (!id) return;

  const latest = db
    .prepare(
      `SELECT file_name FROM media_attachments
       WHERE entity_type = 'vehicle' AND entity_id = ? AND category = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(id, MEDIA_CATEGORY.VEHICLE_ORTHO) as { file_name: string } | undefined;

  const photoUrl = latest
    ? mediaAttachmentFileUrl({
        entity_type: "vehicle",
        entity_id: id,
        file_name: latest.file_name,
      })
    : "";

  db.prepare(
    `UPDATE vehicles SET photo_url = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(photoUrl, id);
}
