/** Public URL for a row in `media_attachments` — served via API so production works without relying on `/uploads` static hosting. */
export function mediaAttachmentFileUrl(parts: {
  entity_type: string;
  entity_id: string;
  file_name: string;
}): string {
  const q = new URLSearchParams({
    entityType: parts.entity_type,
    entityId: parts.entity_id,
    fileName: parts.file_name,
  });
  return `/api/media/file?${q.toString()}`;
}
