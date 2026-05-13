"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { DEFAULT_OPERATOR_CATEGORY } from "@/lib/ehs-operator-categories";

const ORG_LABELS: Record<string, string> = {
  "1pwr_lesotho": "Lesotho",
  "1pwr_zambia": "Zambia",
  "1pwr_benin": "Benin",
  "1pwr_south_africa": "South Africa",
};

type OptionRow = {
  id: string;
  email: string;
  displayName: string;
  hrEmployeeId: string;
  isTrainer?: boolean;
};

export type DesignatedOperatorSelection = {
  id: string;
  displayName: string;
  email: string;
};

interface EhsCompliantDriverPickerFieldProps {
  organizationId: string;
  value: DesignatedOperatorSelection | null;
  onChange: (next: DesignatedOperatorSelection | null) => void;
  /** Operator category for D018 readiness (default on-road fleet). */
  category?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /** Shown under the modal title. */
  helperText?: string;
}

export function EhsCompliantDriverPickerField({
  organizationId,
  value,
  onChange,
  category = DEFAULT_OPERATOR_CATEGORY,
  label = "Approved driver (EHS register)",
  required,
  disabled,
  helperText,
}: EhsCompliantDriverPickerFieldProps): React.ReactElement {
  const reactId = useId();
  const buttonId = `ehs-driver-pick-${reactId}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const countryLabel = ORG_LABELS[organizationId] ?? organizationId.replace(/^1pwr_/i, "").replace(/_/g, " ");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [open, organizationId, debouncedQuery]);

  const loadPage = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await jsonHeadersWithBearer();
      const params = new URLSearchParams({
        org: organizationId,
        category,
        page: String(page),
        pageSize: String(pageSize),
        q: debouncedQuery,
      });
      const res = await fetch(`/api/ehs-approved-drivers/options?${params.toString()}`, { headers });
      const j = (await res.json()) as {
        options?: OptionRow[];
        total?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(j.error || "Could not load drivers");
        setOptions([]);
        setTotal(0);
        return;
      }
      setOptions(Array.isArray(j.options) ? j.options : []);
      setTotal(typeof j.total === "number" ? j.total : 0);
    } catch {
      setError("Network error");
      setOptions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [open, organizationId, category, page, debouncedQuery, pageSize]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  const triggerLabel = value ? `${value.displayName} · ${value.email}` : "Select from EHS register…";

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={buttonId} className="text-sm font-medium text-zinc-700">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      ) : null}
      <button
        type="button"
        id={buttonId}
        disabled={disabled}
        onClick={() => {
          setQuery("");
          setDebouncedQuery("");
          setPage(1);
          setOpen(true);
        }}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition-colors",
          "hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={cn("flex-1 truncate", !value && "text-zinc-500")}>{triggerLabel}</span>
        <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-zinc-400" fill="currentColor">
          <path d="M8 11 3 6h10z" />
        </svg>
      </button>
      {helperText ? <p className="text-xs text-zinc-500">{helperText}</p> : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/40 px-2 pb-2 sm:items-center sm:px-4 sm:pb-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${buttonId}-modal-title`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
              <div>
                <h2 id={`${buttonId}-modal-title`} className="text-base font-semibold text-zinc-900">
                  Approved driver for this organisation
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Register scope: <strong className="font-medium text-zinc-700">{countryLabel}</strong> ({organizationId}
                  ). Only operators who are fully compliant for the selected category are listed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Close"
              >
                <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4 4 12 12M16 4 4 16" />
                </svg>
              </button>
            </header>
            <div className="border-b border-zinc-100 px-4 py-2">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, email, or HR id…"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                aria-label="Search approved drivers"
              />
            </div>
            <ul className="max-h-[50vh] flex-1 overflow-y-auto" role="listbox">
              {loading ? (
                <li className="px-4 py-6 text-center text-sm text-zinc-500">Loading…</li>
              ) : error ? (
                <li className="px-4 py-6 text-center text-sm text-red-700">{error}</li>
              ) : options.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-zinc-500">
                  No compliant drivers match this search for {countryLabel}. Ask EHS to complete the register or widen your search.
                </li>
              ) : (
                options.map((o) => {
                  const isSelected = o.id === value?.id;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange({
                            id: o.id,
                            displayName: o.displayName,
                            email: o.email,
                          });
                          setOpen(false);
                          setQuery("");
                        }}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-zinc-50",
                          isSelected && "bg-emerald-50/80",
                        )}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium text-zinc-900">{o.displayName}</span>
                          <span className="truncate text-xs text-zinc-500">{o.email}</span>
                          {o.hrEmployeeId ? (
                            <span className="text-[11px] text-zinc-400">HR: {o.hrEmployeeId}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          {o.isTrainer ? "Trainer" : "Ready"}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-4 py-2 text-xs text-zinc-600">
              <span>
                {total > 0 ? (
                  <>
                    {rangeStart}–{rangeEnd} of {total}
                  </>
                ) : (
                  "0 results"
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-zinc-500">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
