import path from "path";

type HeicConvert = (options: {
  buffer: Buffer;
  format: "JPEG";
  quality: number;
}) => Promise<ArrayBuffer>;

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
  const convert = (await import("heic-convert")).default as HeicConvert;
  const jpeg = await convert({ buffer, format: "JPEG", quality: 0.85 });
  return Buffer.from(jpeg);
}
