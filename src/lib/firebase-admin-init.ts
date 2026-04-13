import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import fs from "fs";

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "";

/**
 * Single Firebase Admin app for Fleet Hub (token verification, Firestore sync).
 * Name matches firestore-sync.ts ("fleet-sync").
 */
export function getFleetAdminApp(): App | null {
  if (!SERVICE_ACCOUNT_PATH || !fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    return null;
  }
  try {
    const existing = getApps().find((a) => a.name === "fleet-sync");
    if (existing) return existing;
    const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
    return initializeApp({ credential: cert(sa) }, "fleet-sync");
  } catch {
    return null;
  }
}
