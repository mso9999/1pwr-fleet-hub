"use client";

import { useEffect, useState } from "react";
import { jsonHeadersWithBearer } from "./client-bearer";

export interface OverrideCapability {
  /** Loading the capability check. */
  loading: boolean;
  /** True if the caller can override prerequisite gates (admin / fleet management / PR-credentialed approver). */
  canOverride: boolean;
}

/**
 * Hook for client UI that hides the "Manager override" panel from regular users.
 * Server still enforces the same rule on POST.
 *
 * Reads from /api/me/mission-request-can-approve which is the authoritative endpoint
 * for the same approver set we use for prerequisite overrides.
 */
export function useOverrideCapability(organizationId: string | undefined): OverrideCapability {
  const [loading, setLoading] = useState(true);
  const [canOverride, setCanOverride] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!organizationId) {
      setLoading(false);
      setCanOverride(false);
      return () => {
        cancelled = true;
      };
    }
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const headers = await jsonHeadersWithBearer();
        const res = await fetch(
          `/api/me/mission-request-can-approve?org=${encodeURIComponent(organizationId)}`,
          { headers },
        );
        if (!res.ok) {
          if (active && !cancelled) {
            setCanOverride(false);
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as { canApprove?: boolean };
        if (active && !cancelled) {
          setCanOverride(!!data.canApprove);
          setLoading(false);
        }
      } catch {
        if (active && !cancelled) {
          setCanOverride(false);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
      cancelled = true;
    };
  }, [organizationId]);

  return { loading, canOverride };
}
