export function register(): void {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const name = process.env.NEXT_PUBLIC_APP_NAME ?? "fleet-hub";
    const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
    console.info(`[1PWR Fleet Hub] ${name} v${version} · server instrumentation`);
  }
}
