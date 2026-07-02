"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";

export type PassengerTravelMode = "on_vehicle" | "straggler_public_transport";

export interface ManifestPassenger {
  employee_id: string;
  name: string;
  department: string | null;
  country: string | null;
  /**
   * Per-passenger travel mode. Default `on_vehicle` for back-compat with
   * pre-2026-07 manifests. `straggler_public_transport` is set when this
   * person missed the company-vehicle departure and is travelling to the
   * site separately via public transport, but is still associated with the
   * same mission. See FM Scenario A in
   * API/CROSS_TOOLSET_APPROVAL_AUTHORITY_SPEC.md.
   */
  travel_mode?: PassengerTravelMode;
  /** Optional short note (e.g. "missed HQ departure; took public taxi to site"). */
  notes?: string;
}

interface HrEmployee {
  employee_id: string | null;
  name: string;
  email: string;
  department: string | null;
  country: string | null;
  current_position_title: string | null;
}

interface Props {
  value: ManifestPassenger[];
  onChange: (next: ManifestPassenger[]) => void;
  /** Defaults to the user's organization country code if not provided. */
  defaultCountry?: string;
}

/**
 * Passenger manifest picker for the driver vehicle checklist.
 *
 * Passengers are selected from the live HR employee directory (server-side
 * fetch via /api/admin/hr-directory) — never typed as free text — so the
 * manifest references each person by canonical HR `employee_id`. This is what
 * eliminates misspellings and ambiguity, and what lets HR link timecards to a
 * specific field-deployment inspection.
 *
 * Filter dropdowns (country, department) are populated dynamically from
 * /api/admin/hr-directory/meta. The directory is fetched once per filter
 * combination and cached in-component for the picker's lifetime.
 */
export function PassengerManifestPicker({ value, onChange, defaultCountry }: Props): React.ReactElement {
  const { user } = useAuth();
  const [countries, setCountries] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>(defaultCountry || userCountry(user));
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fetchedKeyRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoadingMeta(true);
    (async () => {
      try {
        const res = await fetch("/api/admin/hr-directory/meta", {
          headers: await jsonHeadersWithBearer(),
        });
        if (!res.ok) {
          if (!cancelled) setError("Could not load HR directory filters.");
          return;
        }
        const data = (await res.json()) as { countries?: string[]; departments?: string[] };
        if (!cancelled) {
          setCountries(Array.isArray(data.countries) ? data.countries : []);
          setDepartments(Array.isArray(data.departments) ? data.departments : []);
        }
      } catch {
        if (!cancelled) setError("Could not load HR directory filters.");
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadEmployees = useCallback(async (country: string, department: string) => {
    setLoadingEmployees(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (country) params.set("country", country);
      if (department) params.set("department", department);
      const res = await fetch(`/api/admin/hr-directory?${params.toString()}`, {
        headers: await jsonHeadersWithBearer(),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || `Could not load HR directory (HTTP ${res.status}).`);
        setEmployees([]);
        return;
      }
      const data = (await res.json()) as { employees?: HrEmployee[] };
      const list = Array.isArray(data.employees) ? data.employees.filter((e) => e.employee_id) : [];
      setEmployees(list);
    } catch {
      setError("Could not load HR directory.");
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  useEffect(() => {
    const key = `${selectedCountry || ""}|${selectedDepartment || ""}`;
    if (key === fetchedKeyRef.current) return;
    fetchedKeyRef.current = key;
    void loadEmployees(selectedCountry, selectedDepartment);
  }, [selectedCountry, selectedDepartment, loadEmployees]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selectedIds = useMemo(() => new Set(value.map((p) => p.employee_id)), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => {
      return (
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.employee_id ?? "").toLowerCase().includes(q) ||
        (e.department ?? "").toLowerCase().includes(q) ||
        (e.current_position_title ?? "").toLowerCase().includes(q)
      );
    });
  }, [employees, query]);

  function addPassenger(emp: HrEmployee): void {
    if (!emp.employee_id) return;
    if (selectedIds.has(emp.employee_id)) return;
    onChange([
      ...value,
      {
        employee_id: emp.employee_id,
        name: emp.name,
        department: emp.department ?? null,
        country: emp.country ?? null,
        travel_mode: "on_vehicle",
      },
    ]);
    setQuery("");
  }

  function removePassenger(employeeId: string): void {
    onChange(value.filter((p) => p.employee_id !== employeeId));
  }

  function setTravelMode(employeeId: string, mode: PassengerTravelMode): void {
    onChange(
      value.map((p) =>
        p.employee_id === employeeId ? { ...p, travel_mode: mode } : p,
      ),
    );
  }

  function setNotes(employeeId: string, notes: string): void {
    onChange(
      value.map((p) =>
        p.employee_id === employeeId ? { ...p, notes } : p,
      ),
    );
  }

  return (
    <div className="space-y-3" ref={rootRef}>
      <div>
        <label className="text-sm font-medium text-zinc-700">Passenger manifest</label>
        <p className="text-xs text-zinc-500 mt-0.5">
          Select every 1PWR employee traveling on this vehicle from the HR directory. Passengers are
          referenced by HR employee ID — no free text — so HR can link timecards to this field
          deployment.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600">Country filter</label>
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
            disabled={loadingMeta}
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600">Department filter</label>
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
            disabled={loadingMeta}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") setOpen(true);
          }}
          placeholder="Search employees by name, email, ID, or role…"
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-3 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="passenger-manifest-listbox"
        />
        {open && (
          <div
            id="passenger-manifest-listbox"
            role="listbox"
            className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
          >
            {loadingEmployees ? (
              <div className="px-3 py-2 text-sm text-zinc-500">Loading employees…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">
                {employees.length === 0
                  ? "No employees found for the selected filters."
                  : "No matches."}
              </div>
            ) : (
              <ul className="py-1">
                {filtered.slice(0, 50).map((emp) => {
                  const isSelected = !!emp.employee_id && selectedIds.has(emp.employee_id);
                  return (
                    <li key={emp.employee_id} role="option" aria-selected={isSelected}>
                      <button
                        type="button"
                        disabled={isSelected}
                        onClick={() => addPassenger(emp)}
                        className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 ${
                          isSelected ? "bg-blue-50" : ""
                        }`}
                      >
                        <span className="font-medium text-zinc-900">
                          {emp.name}{" "}
                          <span className="text-xs text-zinc-400">({emp.employee_id})</span>
                        </span>
                        <span className="text-xs text-zinc-500">
                          {[
                            emp.current_position_title,
                            emp.department,
                            emp.country,
                            emp.email,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-red-700">{error}</p>}

      {value.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {value.map((p) => {
            const isStraggler = (p.travel_mode ?? "on_vehicle") === "straggler_public_transport";
            return (
              <li
                key={p.employee_id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  isStraggler
                    ? "border-amber-300 bg-amber-50"
                    : "border-zinc-200 bg-zinc-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-900">{p.name}</span>
                  <span className="text-zinc-500">
                    {[
                      p.employee_id,
                      p.department,
                      p.country,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name} from manifest`}
                    onClick={() => removePassenger(p.employee_id)}
                    className="ml-auto text-zinc-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <label className="text-[10px] font-medium uppercase text-zinc-500">
                    Travel mode
                  </label>
                  <select
                    value={p.travel_mode ?? "on_vehicle"}
                    onChange={(e) =>
                      setTravelMode(p.employee_id, e.target.value as PassengerTravelMode)
                    }
                    className="h-7 rounded border border-zinc-200 bg-white px-1.5 text-[11px]"
                  >
                    <option value="on_vehicle">On company vehicle</option>
                    <option value="straggler_public_transport">
                      Straggler — public transport
                    </option>
                  </select>
                  {isStraggler && (
                    <input
                      type="text"
                      value={p.notes ?? ""}
                      onChange={(e) => setNotes(p.employee_id, e.target.value)}
                      placeholder="Note: e.g. missed HQ departure; took public taxi to site"
                      className="h-7 min-w-[12rem] flex-1 rounded border border-amber-300 bg-white px-2 text-[11px]"
                      maxLength={200}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[11px] text-zinc-500">
          No passengers added yet. Add at least the driver is not required here — the driver is
          captured separately above; list only the additional personnel riding this vehicle.
        </p>
      )}
    </div>
  );
}

function userCountry(user: { organizationId?: string } | null | undefined): string {
  const org = String(user?.organizationId || "").toLowerCase();
  if (org.includes("lesotho") || org.includes("1pwr_ls")) return "LS";
  if (org.includes("zambia") || org.includes("1pwr_zm")) return "ZM";
  if (org.includes("benin") || org.includes("1pwr_bn") || org.includes("1pwr_bj")) return "BJ";
  return "";
}
