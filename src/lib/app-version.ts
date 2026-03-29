/** Injected at build from package.json via next.config.ts */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "fleet-hub";
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

export function appVersionLabel(): string {
  return `${APP_NAME} v${APP_VERSION}`;
}
