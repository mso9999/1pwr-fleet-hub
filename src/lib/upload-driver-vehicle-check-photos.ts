/**
 * Attach verification photos to a driver vehicle check after the check row exists.
 */
export async function uploadDriverVehicleCheckPhotos(
  checkId: string,
  items: Array<{ file: File; category: string; caption: string }>,
  uploadedById: string,
  uploadedByName: string
): Promise<void> {
  for (const { file, category, caption } of items) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entityType", "driver_vehicle_check");
    fd.append("entityId", checkId);
    fd.append("caption", caption);
    fd.append("category", category);
    fd.append("uploadedById", uploadedById);
    fd.append("uploadedByName", uploadedByName);
    const res = await fetch("/api/media", { method: "POST", body: fd });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Photo upload failed");
    }
  }
}
