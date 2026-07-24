"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { Search, X, ChevronLeft, ChevronRight, UserPlus } from "lucide-react";

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
 * fetch via /api/hr-directory/manifest-options) via a modal dialog with
 * search and pagination. Passengers are referenced by canonical HR
 * `employee_id` — never free text.
 *
 * Filter dropdowns (country, department) are populated dynamically from
 * /api/hr-directory/manifest-options/meta. The directory is fetched once per
 * filter combination and cached in-component for the picker's lifetime.
 */
const PAGE_SIZE = 10;

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
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string>("");
  const [page, setPage] = useState(0);
  const fetchedKeyRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoadingMeta(true);
    (async () => {
      try {
        const res = await fetch("/api/hr-directory/manifest-options/meta", {
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
      const res = await fetch(`/api/hr-directory/manifest-options?${params.toString()}`, {
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

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

  function openModal(): void {
    setModalOpen(true);
    setQuery("");
    setPage(0);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium text-zinc-700">Passenger manifest</label>
        <p className="text-xs text-zinc-500 mt-0.5">
          Select 1PWR employees traveling on this vehicle from the HR directory. Passengers are
          referenced by HR employee ID — no free text — so HR can link timecards to this field
          deployment. Leave empty if there are no passengers.
        </p>
      </div>

      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        <UserPlus className="h-4 w-4" />
        {value.length > 0 ? `Edit manifest (${value.length})` : "Add passengers from HR directory"}
      </button>

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
          No passengers added yet. The driver is captured separately above; list only additional
          personnel riding this vehicle. Leave empty if there are no passengers.
        </p>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
              <h2 className="text-base font-semibold text-zinc-900">Select passengers from HR directory</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 border-b border-zinc-100 px-5 py-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-600">Country filter</label>
                  <select
                    value={selectedCountry}
                    onChange={(e) => { setSelectedCountry(e.target.value); setPage(0); }}
                    className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                    disabled={loadingMeta}
                  >
                    <option value="">All countries</option>
                    {countries.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-zinc-600">Department filter</label>
                  <select
                    value={selectedDepartment}
                    onChange={(e) => { setSelectedDepartment(e.target.value); setPage(0); }}
                    className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                    disabled={loadingMeta}
                  >
                    <option value="">All departments</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                  placeholder="Search by name, email, employee ID, or role…"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto px-5 py-3">
              {loadingEmployees ? (
                <div className="py-8 text-center text-sm text-zinc-500">Loading employees…</div>
              ) : pageItems.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  {employees.length === 0
                    ? "No employees found for the selected filters."
                    : "No matches for your search."}
                </div>
              ) : (
                <ul className="space-y-1">
                  {pageItems.map((emp) => {
                    const isSelected = !!emp.employee_id && selectedIds.has(emp.employee_id);
                    return (
                      <li key={emp.employee_id}>
                        <button
                          type="button"
                          disabled={isSelected}
                          onClick={() => addPassenger(emp)}
                          className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 ${
                            isSelected ? "bg-blue-50" : ""
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-zinc-900">
                              {emp.name}{" "}
                              <span className="text-xs text-zinc-400">({emp.employee_id})</span>
                            </div>
                            <div className="text-xs text-zinc-500">
                              {[
                                emp.current_position_title,
                                emp.department,
                                emp.country,
                                emp.email,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                          {isSelected ? (
                            <span className="shrink-0 text-xs font-medium text-blue-600">Added</span>
                          ) : (
                            <span className="shrink-0 text-xs font-medium text-zinc-400">+ Add</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3">
              <span className="text-xs text-zinc-500">
                {filtered.length} employee{filtered.length !== 1 ? "s" : ""}
                {value.length > 0 ? ` · ${value.length} selected` : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-zinc-600">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
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
