import { auth } from "@/lib/firebase";

/** JSON fetch headers with Firebase ID token when signed in (for server-side attribution). */
export async function jsonHeadersWithBearer(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Only `Authorization: Bearer …` — use for `FormData` POST (browser sets multipart
 * Content-Type) or for GET/DELETE that must not send `Content-Type: application/json`.
 */
export async function bearerAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
