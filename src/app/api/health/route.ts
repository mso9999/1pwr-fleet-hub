import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getFirebaseAdminStatus } from "@/lib/firebase-admin-init";

/**
 * GET /api/health
 *
 * Pre-flight check for production. Meant for the deploy workflow's curl step and any
 * uptime monitor. Returns 200 when every critical subsystem is live, 503 otherwise,
 * with a structured body so operators can see exactly what failed.
 *
 * Subsystems checked:
 *   - SQLite DB (schema / latest migration present)
 *   - Firebase Admin (service-account credential loaded)
 *
 * Anonymous — intentionally publishes no user data, just subsystem state.
 */
export function GET(): NextResponse {
  const started = Date.now();
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // SQLite
  try {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
    checks.db = { ok: true, detail: `users=${row.c}` };
  } catch (err) {
    checks.db = { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }

  // Firebase Admin credential
  const fb = getFirebaseAdminStatus();
  checks.firebaseAdmin = fb.ok
    ? { ok: true, detail: fb.source ?? "loaded" }
    : {
        ok: false,
        detail: `${fb.error ?? "credential missing"} · tried: ${fb.tried.join(" | ")}`,
      };

  const allOk = Object.values(checks).every((c) => c.ok);
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
  const commit = process.env.NEXT_PUBLIC_APP_COMMIT ?? "dev";
  const body = {
    ok: allOk,
    version: `${version}+${commit}`,
    build_time: process.env.NEXT_PUBLIC_APP_BUILD_TIME ?? "",
    ms: Date.now() - started,
    checks,
  };
  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
