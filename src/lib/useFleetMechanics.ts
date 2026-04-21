"use client";

import { useEffect, useState } from "react";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";

/** Fallback set used only while the API call is in flight or fails; mirrors the pre-DB
 *  hardcoded list so the dropdown is never empty. The seed in migrateFleetMechanics
 *  inserts these same names into fleet_mechanics on first run. */
const FALLBACK_MECHANIC_NAMES = [
  "Tebesi",
  "Kola",
  "Thene",
  "Molefe",
  "Khanare",
  "Seutloali",
  "Kubutu",
  "Kelebone",
];

export function useFleetMechanicOptions(organizationId: string): {
  names: string[];
  loading: boolean;
} {
  const [names, setNames] = useState<string[]>(FALLBACK_MECHANIC_NAMES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/fleet-mechanics?org=${encodeURIComponent(organizationId)}&status=active`,
          { headers: await jsonHeadersWithBearer() }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          mechanics?: Array<{ display_name: string }>;
        };
        const list = (data.mechanics ?? [])
          .map((m) => (m.display_name || "").trim())
          .filter((s) => s.length > 0);
        if (!cancelled && list.length > 0) setNames(list);
      } catch {
        /* non-fatal: keep fallback */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return { names, loading };
}
