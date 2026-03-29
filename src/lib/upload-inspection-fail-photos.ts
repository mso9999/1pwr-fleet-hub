/**
 * Upload photos queued for failed checklist rows after the inspection row exists.
 */
export async function uploadInspectionFailPhotos(
  inspectionId: string,
  items: Array<{ category: string; item: string }>,
  pendingPhotosByIndex: Record<number, File[]>,
  uploadedById: string,
  uploadedByName: string
): Promise<void> {
  for (const [key, files] of Object.entries(pendingPhotosByIndex)) {
    const idx = Number(key);
    if (!Number.isFinite(idx) || !files?.length) continue;
    const row = items[idx];
    if (!row) continue;
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entityType", "inspection");
      fd.append("entityId", inspectionId);
      fd.append("caption", `${row.category}: ${row.item}`);
      fd.append("category", "fail_evidence");
      fd.append("uploadedById", uploadedById);
      fd.append("uploadedByName", uploadedByName);
      const res = await fetch("/api/media", { method: "POST", body: fd });
      if (!res.ok) {
        console.error("Inspection fail photo upload failed", idx, await res.text());
      }
    }
  }
}
