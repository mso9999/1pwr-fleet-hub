import type { NextRequest } from "next/server";
import { streamMediaAttachmentFile } from "@/lib/media-attachment-stream";

/**
 * Legacy URL shape: `/uploads/{entity_type}/{entity_id}/{file_name}` (same as on-disk layout).
 * Serves through DB + disk checks so it works when Nginx proxies `/uploads/` to Next
 * instead of using a static `alias` to an empty or out-of-sync folder.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
): Promise<Response> {
  const { path: segments } = await context.params;
  const parts = segments ?? [];
  if (parts.length !== 3) {
    return new Response("Not found", { status: 404 });
  }
  const [entityType, entityId, fileName] = parts;
  if (!entityType || !entityId || !fileName) {
    return new Response("Not found", { status: 404 });
  }
  return streamMediaAttachmentFile(entityType, entityId, fileName);
}
