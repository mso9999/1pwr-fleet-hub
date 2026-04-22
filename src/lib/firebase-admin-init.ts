import { initializeApp, cert, getApps, type App, type ServiceAccount } from "firebase-admin/app";
import fs from "fs";
import path from "path";

/**
 * Resolution order for the Firebase Admin service account. We accept several sources so
 * the deploy does not depend on a single env var being set in PM2's shell. The first one
 * that yields a parseable credential wins.
 *
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON   — inline JSON (base64 or plain text)
 *   2. FIREBASE_SERVICE_ACCOUNT_PATH   — absolute or relative path
 *   3. ./firebase-service-account.json in process.cwd() (common EC2 deploy layout)
 *   4. /var/www/fleet-hub/firebase-service-account.json
 *   5. $HOME/firebase-service-account.json
 */

interface CredentialSource {
  description: string;
  load: () => ServiceAccount | null;
}

function parseInlineJson(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accept either plain JSON or base64-encoded JSON (handy for env files that can't hold newlines).
  const candidates: string[] = [];
  if (trimmed.startsWith("{")) {
    candidates.push(trimmed);
  } else {
    try {
      candidates.push(Buffer.from(trimmed, "base64").toString("utf8"));
    } catch {
      /* not base64 */
    }
  }
  for (const body of candidates) {
    try {
      const parsed = JSON.parse(body) as ServiceAccount;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

function parseFile(p: string): ServiceAccount | null {
  try {
    if (!fs.existsSync(p)) return null;
    const body = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(body) as ServiceAccount;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function defaultPaths(): string[] {
  const out: string[] = [];
  try {
    out.push(path.join(process.cwd(), "firebase-service-account.json"));
  } catch {
    /* ignore */
  }
  out.push("/var/www/fleet-hub/firebase-service-account.json");
  const home = process.env.HOME;
  if (home) out.push(path.join(home, "firebase-service-account.json"));
  return Array.from(new Set(out));
}

function sources(): CredentialSource[] {
  const list: CredentialSource[] = [
    {
      description: "env FIREBASE_SERVICE_ACCOUNT_JSON",
      load: () => parseInlineJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    },
  ];
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (envPath) {
    list.push({
      description: `env FIREBASE_SERVICE_ACCOUNT_PATH=${envPath}`,
      load: () => parseFile(envPath),
    });
  }
  for (const p of defaultPaths()) {
    list.push({ description: `default path ${p}`, load: () => parseFile(p) });
  }
  return list;
}

export interface FirebaseAdminStatus {
  ok: boolean;
  source?: string;
  error?: string;
  tried: string[];
}

let cachedStatus: FirebaseAdminStatus | null = null;

/**
 * Initialise (or reuse) the Fleet Hub Firebase Admin app. Returns the app when a
 * service-account credential could be loaded from any supported source, otherwise
 * records the failure in {@link getFirebaseAdminStatus} for diagnostics.
 */
export function getFleetAdminApp(): App | null {
  const existing = getApps().find((a) => a.name === "fleet-sync");
  if (existing) {
    if (!cachedStatus) cachedStatus = { ok: true, source: "reused existing app", tried: [] };
    return existing;
  }

  const tried: string[] = [];
  for (const s of sources()) {
    tried.push(s.description);
    const sa = s.load();
    if (!sa) continue;
    try {
      const app = initializeApp({ credential: cert(sa) }, "fleet-sync");
      cachedStatus = { ok: true, source: s.description, tried };
      return app;
    } catch (err) {
      cachedStatus = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        tried,
      };
      return null;
    }
  }

  cachedStatus = {
    ok: false,
    error: "No Firebase Admin service-account credential found.",
    tried,
  };
  return null;
}

export function getFirebaseAdminStatus(): FirebaseAdminStatus {
  if (!cachedStatus) {
    getFleetAdminApp();
  }
  return cachedStatus ?? {
    ok: false,
    error: "firebase-admin-init not initialised",
    tried: [],
  };
}
