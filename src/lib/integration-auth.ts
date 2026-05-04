import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Server-to-server auth for PR and other integrations.
 * Set `FLEET_INTEGRATION_API_KEY` (≥12 chars) and send header `X-Fleet-Integration-Key`.
 */
export function verifyFleetIntegrationKey(request: NextRequest): boolean {
  const secret = process.env.FLEET_INTEGRATION_API_KEY?.trim();
  if (!secret || secret.length < 12) return false;
  const presented = request.headers.get("x-fleet-integration-key")?.trim() ?? "";
  if (presented.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(presented, "utf8"), Buffer.from(secret, "utf8"));
  } catch {
    return false;
  }
}
