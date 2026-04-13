import { auth } from "@/lib/firebase";

/** JSON fetch headers with Firebase ID token when signed in (for server-side attribution). */
export async function jsonHeadersWithBearer(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
