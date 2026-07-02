/**
 * HR-canonical cross-toolset approval authority for Fleet Hub.
 *
 * HR Portal is the canonical source for per-employee approval roles across
 * PR, HR, FM, AM, CC. Fleet Hub pulls the FM roles from the HR directory
 * (/api/employees/directory) and uses them to authorize mission approvals,
 * capacity arbitration, prerequisite overrides, etc.
 *
 * Pull-only contract: Fleet Hub never writes back to HR. We refresh the
 * cached directory every 5 minutes (TTL) and on cache miss. If HR is
 * unreachable, callers fall back to the legacy vehicle_check_override_approvers
 * table until Phase 6 deprecates that fallback.
 *
 * See API/CROSS_TOOLSET_APPROVAL_AUTHORITY_SPEC.md for the contract.
 */

import type { Database } from "better-sqlite3";
import {
  fetchHrEmployeeDirectory,
  type HrDirectoryEmployee,
} from "@/lib/hr-directory-client";

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface HrToolsetApproval {
  toolset: string;
  approval_role: string;
  scope_country_code: string | null;
  scope_organization_id: string | null;
}

interface ApprovalCacheEntry {
  fetchedAt: number;
  byEmail: Map<string, HrDirectoryEmployee & { toolset_approvals?: HrToolsetApproval[] }>;
  /** True when the last fetch failed; callers can use this to log/telemetry. */
  lastFetchFailed: boolean;
}

let cache: ApprovalCacheEntry | null = null;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Refresh the in-memory cache from HR. Safe to call repeatedly; on failure
 * leaves the existing cache in place so a transient HR outage doesn't wipe
 * our authorization state.
 */
async function refreshCache(): Promise<void> {
  const result = await fetchHrEmployeeDirectory();
  if (!result.ok || !result.employees) {
    if (cache) {
      cache.lastFetchFailed = true;
    }
    return;
  }
  const byEmail = new Map<string, HrDirectoryEmployee & { toolset_approvals?: HrToolsetApproval[] }>();
  for (const emp of result.employees) {
    if (emp.email) {
      // HrDirectoryEmployee doesn't formally include toolset_approvals in
      // its TS shape yet (added 2026-07-03); cast through unknown to read it.
      const withApprovals = emp as HrDirectoryEmployee & { toolset_approvals?: HrToolsetApproval[] };
      byEmail.set(normalizeEmail(emp.email), withApprovals);
    }
  }
  cache = { fetchedAt: Date.now(), byEmail, lastFetchFailed: false };
}

/**
 * Force-refresh the cache. Exposed for admin tooling / tests; production
 * callers should rely on the TTL-driven lazy refresh in getHrEmployeeByEmail.
 */
export async function refreshHrApprovalCache(): Promise<void> {
  await refreshCache();
}

/** Test hook: wipe the cache (e.g. between unit tests). */
export function clearHrApprovalCache(): void {
  cache = null;
}

/** Test hook: inject a pre-built cache without hitting the network. */
export function setHrApprovalCacheForTest(byEmail: Map<string, HrDirectoryEmployee & { toolset_approvals?: HrToolsetApproval[] }>): void {
  cache = { fetchedAt: Date.now(), byEmail, lastFetchFailed: false };
}

/**
 * Look up an employee by email, refreshing the cache first if it's stale.
 * Returns null when HR is unreachable AND we have no cache, or when the
 * email is unknown to HR.
 */
export async function getHrEmployeeByEmail(
  email: string,
): Promise<(HrDirectoryEmployee & { toolset_approvals?: HrToolsetApproval[] }) | null> {
  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    await refreshCache();
  }
  if (!cache) return null;
  return cache.byEmail.get(normalizeEmail(email)) ?? null;
}

/**
 * Does the user have an HR-canonical grant for (toolset=fm, approvalRole)?
 *
 * Superadmin (HR role) is a universal approver and short-circuits to true.
 * A grant matches when:
 *   - the row is global (scope_country_code is null), OR
 *   - the row's scope_country_code matches `country` (case-insensitive)
 *
 * Returns false when HR is unreachable and we have no cache for this user.
 * Callers should fall back to the legacy vehicle_check_override_approvers
 * table in that case (until Phase 6 removes the fallback).
 */
export async function hasHrFmApprovalRole(
  email: string,
  approvalRole: string,
  country?: string | null,
): Promise<boolean> {
  const emp = await getHrEmployeeByEmail(email);
  if (!emp) return false;
  if ((emp.role || "").toLowerCase() === "superadmin") return true;
  const roles = (emp.toolset_approvals ?? []).filter(
    (a) => a.toolset === "fm" && a.approval_role === approvalRole,
  );
  const upperCountry = country ? country.toUpperCase() : null;
  for (const r of roles) {
    if (!r.scope_country_code) return true; // global grant
    if (upperCountry && r.scope_country_code.toUpperCase() === upperCountry) return true;
  }
  return false;
}

/**
 * Derive the ISO country code (LS / ZM / BJ) from a Fleet organization_id
 * via the local organizations table. Returns null if the org is unknown.
 */
export function countryFromOrganization(
  db: Database,
  organizationId: string,
): string | null {
  if (!organizationId) return null;
  const row = db
    .prepare("SELECT country FROM organizations WHERE id = ?")
    .get(organizationId) as { country?: string | null } | undefined;
  const c = (row?.country || "").trim().toUpperCase();
  return c || null;
}
