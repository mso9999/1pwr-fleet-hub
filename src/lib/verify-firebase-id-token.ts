import crypto from "node:crypto";

/**
 * Stand-alone Firebase ID token verifier.
 *
 * Firebase issues ID tokens as RS256 JWTs signed by Google. Google publishes the public
 * keys used to sign them at a well-known URL; we can verify a token with only
 * `node:crypto`, the JWKS URL, and the project ID. That avoids any dependency on a
 * service-account JSON file on disk — which is the RCA for the auth_unconfigured class
 * of failure we hit in production.
 *
 * Firestore admin operations (e.g. PR reference sync) still need firebase-admin + a
 * service-account JSON — but token verification (the critical path for every user
 * session) no longer does.
 */

const GOOGLE_PUBLIC_KEYS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "pr-system-4ea55";

interface CachedKeys {
  keys: Record<string, string>;
  expiresAt: number;
}

let cached: CachedKeys | null = null;

async function getGooglePublicKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.keys;

  const res = await fetch(GOOGLE_PUBLIC_KEYS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Firebase public keys (${res.status})`);

  const keys = (await res.json()) as Record<string, string>;
  // Respect Cache-Control: max-age on the response if present; else cache 1 hour.
  const cc = res.headers.get("cache-control") || "";
  const m = /max-age=(\d+)/i.exec(cc);
  const ttlSec = m ? Math.max(60, Math.min(86400, parseInt(m[1], 10))) : 3600;
  cached = { keys, expiresAt: now + ttlSec * 1000 };
  return keys;
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 2 ? "==" : input.length % 4 === 3 ? "=" : "";
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

interface FirebaseTokenHeader {
  alg: string;
  kid: string;
  typ?: string;
}

interface FirebaseTokenPayload {
  iss: string;
  aud: string;
  sub: string;
  auth_time?: number;
  iat: number;
  exp: number;
  user_id?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase?: {
    identities?: Record<string, string[]>;
    sign_in_provider?: string;
  };
}

export interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

/**
 * Verify a Firebase ID token. Returns the decoded claims on success or null on any
 * failure (bad signature, expired, wrong project, wrong issuer, unknown kid, etc.).
 * Throws on upstream/network failures so callers can surface a 5xx instead of 401.
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string = FIREBASE_PROJECT_ID
): Promise<VerifiedFirebaseToken | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header: FirebaseTokenHeader;
  let payload: FirebaseTokenPayload;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]).toString("utf-8")) as FirebaseTokenHeader;
    payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf-8")) as FirebaseTokenPayload;
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.iat !== "number" || payload.iat > now + 60) return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || typeof payload.sub !== "string") return null;

  // Signature check with Google's public key for the kid on the header.
  const keys = await getGooglePublicKeys();
  const cert = keys[header.kid];
  if (!cert) return null;

  const signedInput = `${parts[0]}.${parts[1]}`;
  const signature = base64UrlDecode(parts[2]);
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(signedInput);
  verifier.end();
  const ok = verifier.verify(cert, signature);
  if (!ok) return null;

  return {
    uid: payload.sub,
    email: (payload.email || "").trim(),
    name: (payload.name || payload.email || payload.sub).toString(),
    emailVerified: payload.email_verified === true,
  };
}
