import { NextRequest, NextResponse } from "next/server";
import { streamMediaAttachmentFile } from "@/lib/media-attachment-stream";

/**
 * GET /api/media/file?entityType=…&entityId=…&fileName=…
 * Streams a stored upload after verifying a matching `media_attachments` row.
 *
 * Intentionally does not require `Authorization` — `<img src>` cannot send bearer tokens.
 * Access is the same model as legacy nginx `/uploads/` (unguessable UUID paths).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const entityType = (searchParams.get("entityType") || "").trim();
  const entityId = (searchParams.get("entityId") || "").trim();
  const fileName = (searchParams.get("fileName") || "").trim();
  return streamMediaAttachmentFile(entityType, entityId, fileName);
}
