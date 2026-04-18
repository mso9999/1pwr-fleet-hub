import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import pkg from "./package.json";

/** Resolve the short git commit of the build tree; falls back to "dev" outside git checkouts. */
function resolveCommit(): string {
  const env =
    process.env.NEXT_PUBLIC_APP_COMMIT ||
    process.env.GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_NAME: pkg.name,
    NEXT_PUBLIC_APP_COMMIT: resolveCommit(),
    NEXT_PUBLIC_APP_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
