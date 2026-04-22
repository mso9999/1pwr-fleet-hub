export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const name = process.env.NEXT_PUBLIC_APP_NAME ?? "fleet-hub";
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
  const commit = process.env.NEXT_PUBLIC_APP_COMMIT ?? "dev";
  console.info(`[1PWR Fleet Hub] ${name} v${version}+${commit} · server instrumentation`);

  // Probe Firebase Admin at boot. If the service-account credential can't be loaded for
  // any reason, we want that failure visible in PM2 logs immediately — not only after
  // the first user hits a token-verified endpoint. Paired with GET /api/me/whoami which
  // reports the same state, this eliminates silent auth outages like the one on
  // 2026-04-22 where /api/ehs-approved-drivers returned 401 for every user.
  try {
    const { getFleetAdminApp, getFirebaseAdminStatus } = await import("@/lib/firebase-admin-init");
    getFleetAdminApp();
    const status = getFirebaseAdminStatus();
    if (status.ok) {
      console.info(`[firebase-admin] OK · loaded from: ${status.source}`);
    } else {
      console.error(
        `[firebase-admin] FAIL · ${status.error} · tried: ${status.tried.join(" | ")}`
      );
    }
  } catch (err) {
    console.error(
      `[firebase-admin] boot probe threw: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
