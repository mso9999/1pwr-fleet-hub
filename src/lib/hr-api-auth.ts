import type Database from "better-sqlite3";

/**
 * Auth helper for HR-facing read-only APIs.
 *
 * Mirrors HR's own pattern: an `X-API-Key` header containing a Fleet-issued
 * key (env: FLEET_HR_API_KEY), plus an optional IP allow-list
 * (env: FLEET_HR_API_ALLOWED_IPS, comma-separated IPs or CIDRs). If the
 * allow-list env var is unset, any IP is accepted (the key alone gates access).
 */

export type HrAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; error: string };

function ipInCidr(ip: string, cidr: string): boolean {
  const [cidrIp, prefixStr] = cidr.split("/").map((s) => s.trim());
  const prefix = prefixStr ? parseInt(prefixStr, 10) : 32;
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return false;
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(cidrIp);
  if (a === null || b === null) return false;
  const mask = prefix === 0 ? 0 : 0xffffffff << (32 - prefix);
  return (a & mask) === (b & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => p.trim());
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (!Number.isFinite(n) || n < 0 || n > 255) return null;
    result = (result << 8) + n;
  }
  return result >>> 0;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip") || "";
}

export function authorizeHrApiRequest(request: Request): HrAuthResult {
  const expectedKey = String(process.env.FLEET_HR_API_KEY || "").trim();
  if (!expectedKey) {
    return {
      ok: false,
      status: 401,
      error:
        "FLEET_HR_API_KEY is not configured on the Fleet Hub server. Ask the Fleet admin to issue HR a key.",
    };
  }
  const provided = request.headers.get("x-api-key")?.trim() || "";
  if (!provided || provided !== expectedKey) {
    return { ok: false, status: 401, error: "Missing or invalid X-API-Key." };
  }

  const allowListRaw = String(process.env.FLEET_HR_API_ALLOWED_IPS || "").trim();
  if (allowListRaw) {
    const allowed = allowListRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ip = clientIp(request);
    if (ip && !allowed.some((entry) => ipInCidr(ip, entry))) {
      return {
        ok: false,
        status: 403,
        error: `Client IP ${ip} is not on the Fleet HR API allow-list.`,
      };
    }
  }
  return { ok: true };
}
