/** Injected at build from package.json and git metadata via next.config.ts */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "fleet-hub";
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT ?? "dev";
export const APP_BUILD_TIME = process.env.NEXT_PUBLIC_APP_BUILD_TIME ?? "";

export function appVersionLabel(): string {
  const base = `${APP_NAME} v${APP_VERSION}+${APP_COMMIT}`;
  return APP_BUILD_TIME ? `${base} (built ${APP_BUILD_TIME})` : base;
}
