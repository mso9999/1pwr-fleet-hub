/**
 * Server-side fetch of HR Portal employee directory (biographic fields only).
 * Requires HR_API_BASE_URL and HR_API_KEY (the Fleet-dedicated key slot on the
 * HR side: HR_API_KEY_FLEET_HUB). Server-side only — never expose the key to
 * the browser.
 */

export interface HrDirectoryEmployee {
  id: number;
  employee_id: string | null;
  name: string;
  email: string;
  role: string;
  type: string;
  country: string | null;
  department: string | null;
  primary_deployment: string | null;
  current_position_title: string | null;
  employment_start_date: string | null;
  phone: string | null;
  headshot: string | null;
  status: string;
  /** ISO 8601 timestamp of the underlying user row's last update; cursor for `since`-based incremental syncs. May be null on legacy rows. */
  last_updated_at: string | null;
}

export interface HrDirectoryResult {
  ok: boolean;
  employees?: HrDirectoryEmployee[];
  count?: number;
  error?: string;
}

export interface HrDirectoryMeta {
  ok: boolean;
  countries?: string[];
  departments?: string[];
  error?: string;
}

interface HrDirectoryRawEmployee {
  id?: number;
  employee_id?: string | null;
  name?: string;
  email?: string;
  role?: string;
  type?: string;
  country?: string | null;
  department?: string | null;
  primary_deployment?: string | null;
  current_position_title?: string | null;
  employment_start_date?: string | null;
  phone?: string | null;
  headshot?: string | null;
  status?: string;
  last_updated_at?: string | null;
}

function normalizeEmployee(raw: HrDirectoryRawEmployee): HrDirectoryEmployee {
  return {
    id: Number(raw.id ?? 0),
    employee_id: raw.employee_id ?? null,
    name: String(raw.name ?? "").trim(),
    email: String(raw.email ?? "").trim(),
    role: String(raw.role ?? ""),
    type: String(raw.type ?? ""),
    country: raw.country ?? null,
    department: raw.department ?? null,
    primary_deployment: raw.primary_deployment ?? null,
    current_position_title: raw.current_position_title ?? null,
    employment_start_date: raw.employment_start_date ?? null,
    phone: raw.phone ?? null,
    headshot: raw.headshot ?? null,
    status: String(raw.status ?? ""),
    last_updated_at: raw.last_updated_at ?? null,
  };
}

function hrConfig(): { base: string; key: string } | { error: string } {
  const base = (process.env.HR_API_BASE_URL || "").replace(/\/$/, "");
  const key = process.env.HR_API_KEY || "";
  if (!base || !key) {
    return {
      error:
        "HR_API_BASE_URL or HR_API_KEY not configured (set in Fleet Hub environment)",
    };
  }
  return { base, key };
}

export async function fetchHrEmployeeDirectory(params?: {
  country?: string;
  department?: string;
  /** ISO 8601 date/datetime; narrows to employees updated at/after this timestamp (incremental sync). */
  since?: string;
}): Promise<HrDirectoryResult> {
  const cfg = hrConfig();
  if ("error" in cfg) return { ok: false, error: cfg.error };
  const url = new URL(`${cfg.base}/api/employees/directory`);
  if (params?.country) url.searchParams.set("country", params.country);
  if (params?.department) url.searchParams.set("department", params.department);
  if (params?.since) url.searchParams.set("since", params.since);
  try {
    const res = await fetch(url.toString(), {
      headers: { "X-API-Key": cfg.key },
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
      employees?: HrDirectoryRawEmployee[];
      count?: number;
    };
    const employees = (data.employees ?? []).map(normalizeEmployee);
    return {
      ok: true,
      employees,
      count: data.count ?? employees.length,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchHrEmployeeMeta(): Promise<HrDirectoryMeta> {
  const cfg = hrConfig();
  if ("error" in cfg) return { ok: false, error: cfg.error };
  try {
    const res = await fetch(`${cfg.base}/api/employees/meta`, {
      headers: { "X-API-Key": cfg.key },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `HR API meta ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      countries?: unknown;
      departments?: unknown;
    };
    const toStringArray = (v: unknown): string[] =>
      Array.isArray(v)
        ? v
            .map((x) => (typeof x === "string" ? x : String(x ?? "")))
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    return {
      ok: true,
      countries: toStringArray(data.countries),
      departments: toStringArray(data.departments),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
