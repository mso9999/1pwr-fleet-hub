import { bearerAuthHeaders } from "@/lib/client-bearer";

/**
 * Attach verification photos to a driver vehicle check after the check row exists.
 * Uses Firebase bearer auth (required by POST /api/media).
 */
export async function uploadDriverVehicleCheckPhotos(
  checkId: string,
  items: Array<{ file: File; category: string; caption: string }>,
  uploadedById: string,
  uploadedByName: string,
  organizationId: string
): Promise<void> {
  const headers = await bearerAuthHeaders();
  if (!headers.Authorization) {
    throw new Error("You must be signed in to upload verification photos.");
  }

  for (const { file, category, caption } of items) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entityType", "driver_vehicle_check");
    fd.append("entityId", checkId);
    fd.append("caption", caption);
    fd.append("category", category);
    fd.append("uploadedById", uploadedById);
    fd.append("uploadedByName", uploadedByName);
    fd.append("organizationId", organizationId);
    const res = await fetch("/api/media", { method: "POST", headers, body: fd });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || "Photo upload failed");
    }
  }
}
