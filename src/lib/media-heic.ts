import path from "path";

export function isHeicUpload(fileName: string, mimeType: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  const mime = mimeType.toLowerCase();
  return mime === "image/heic" || mime === "image/heif" || ext === ".heic" || ext === ".heif";
}

/**
 * iPhone camera uploads are HEIC. Chrome and Firefox will not paint those in
 * an img tag, so the photo looks like it never saved. Store a JPEG instead.
 */
export async function jpegBufferFromHeic(buffer: Buffer): Promise<Buffer> {
  const { default: convert } = await import("heic-convert");
  const jpeg = await convert({ buffer, format: "JPEG", quality: 0.85 });
  return Buffer.from(jpeg);
}
