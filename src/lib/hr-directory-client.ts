/**
 * Server-side fetch of HR Portal employee directory (biographic fields only).
 * Requires HR_API_BASE_URL and HR_API_KEY (same key as CC Portal: X-API-Key).
 */

export interface HrDirectoryEmployee {
  id: number;
  employee_id: string | null;
  name: string;
  email: string;
  role: string;
  type: string;
  country: string | null;
  primary_deployment: string | null;
  status: string;
}

export interface HrDirectoryResult {
  ok: boolean;
  employees?: HrDirectoryEmployee[];
  count?: number;
  error?: string;
}

export async function fetchHrEmployeeDirectory(params?: {
  country?: string;
}): Promise<HrDirectoryResult> {
  const base = (process.env.HR_API_BASE_URL || "").replace(/\/$/, "");
  const key = process.env.HR_API_KEY || "";
  if (!base || !key) {
    return {
      ok: false,
      error:
        "HR_API_BASE_URL or HR_API_KEY not configured (set in Fleet Hub environment)",
    };
  }
  const url = new URL(`${base}/api/employees/directory`);
  if (params?.country) url.searchParams.set("country", params.country);
  try {
    const res = await fetch(url.toString(), {
      headers: { "X-API-Key": key },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `HR API ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      employees?: HrDirectoryEmployee[];
      count?: number;
    };
    return {
      ok: true,
      employees: data.employees ?? [],
      count: data.count ?? data.employees?.length ?? 0,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
