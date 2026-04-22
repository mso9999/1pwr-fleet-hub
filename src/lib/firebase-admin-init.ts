import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import fs from "fs";

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "";

let loggedOnce = false;
function warnOnce(msg: string): void {
  if (loggedOnce) return;
  loggedOnce = true;
  console.error(`[firebase-admin-init] ${msg}`);
}

/**
 * Single Firebase Admin app for Fleet Hub (token verification, Firestore sync).
 * Name matches firestore-sync.ts ("fleet-sync").
 *
 * Returns null and logs one warning when the environment is missing the service-account
 * file, so any token-verified endpoint can respond with reason="auth_unconfigured" and
 * operators can spot the PM2 log line that points at what to fix.
 */
export function getFleetAdminApp(): App | null {
  if (!SERVICE_ACCOUNT_PATH) {
    warnOnce(
      "FIREBASE_SERVICE_ACCOUNT_PATH is not set. All token-verified endpoints will return 'auth_unconfigured'. Set the env var to the service-account JSON path and restart PM2."
    );
    return null;
  }
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    warnOnce(
      `FIREBASE_SERVICE_ACCOUNT_PATH=${SERVICE_ACCOUNT_PATH} does not exist on disk. Place the service-account JSON there (permissions 600) and restart PM2.`
    );
    return null;
  }
  try {
    const existing = getApps().find((a) => a.name === "fleet-sync");
    if (existing) return existing;
    const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
    return initializeApp({ credential: cert(sa) }, "fleet-sync");
  } catch (err) {
    warnOnce(
      `Failed to initialise Firebase Admin from ${SERVICE_ACCOUNT_PATH}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}
