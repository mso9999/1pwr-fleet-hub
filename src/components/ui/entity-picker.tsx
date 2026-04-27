"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

export type EntityPickerOption = {
  /** Stable string value stored on the form. */
  value: string;
  /** Primary label rendered as the first row of the option. */
  label: string;
  /** Optional secondary line (smaller, zinc-500). */
  description?: string;
  /** Optional small badge / status text rendered on the right. */
  meta?: string;
  /** Optional badge tone for the meta chip. */
  metaTone?: "default" | "success" | "warning" | "danger" | "info";
  /** Optional extra tokens included in the search match (e.g. registration plate). */
  searchTokens?: string[];
  /** Disables the option (still visible, not selectable). */
  disabled?: boolean;
};

export interface EntityPickerCreateCta {
  label: string;
  href: string;
  helperText?: string;
}

interface EntityPickerFieldProps {
  /** External label rendered above the trigger button. */
  label?: string;
  /** Currently selected value (or null/empty for "no selection"). */
  value: string | null | undefined;
  /** Called with the new value when the user picks an option. */
  onChange: (value: string) => void;
  options: EntityPickerOption[];
  /** Title rendered at the top of the modal. */
  modalTitle: string;
  /** Helper line under the modal title. */
  modalDescription?: ReactNode;
  /** Placeholder shown on the trigger when no value is set. */
  placeholder?: string;
  /** Placeholder for the search field inside the modal. */
  searchPlaceholder?: string;
  /** Marks the field as required for screen readers + visual indicator. */
  required?: boolean;
  disabled?: boolean;
  /** Hidden input name so it can be picked up by native form submissions. */
  name?: string;
  /** When true, an "All / None" empty option is allowed. */
  allowClear?: boolean;
  clearLabel?: string;
  /** Renders a "Create new" CTA at the top of the modal list. */
  createCta?: EntityPickerCreateCta;
  /** Loading state — shows a spinner row in the modal. */
  loading?: boolean;
  /** Custom empty-state node when the filtered list is empty. */
  emptyState?: ReactNode;
  className?: string;
  /** Optional id for tutorial / data-* targeting. */
  id?: string;
  /** Additional helper text rendered below the trigger. */
  helperText?: ReactNode;
  /** Show a count badge ("12 options") inside the trigger. */
  showCount?: boolean;
}

const metaToneClasses: Record<NonNullable<EntityPickerOption["metaTone"]>, string> = {
  default: "bg-zinc-100 text-zinc-700",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-rose-100 text-rose-700",
  info: "bg-sky-100 text-sky-700",
};

function normalize(input: string): string {
  return input.toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "");
}

function tokensForOption(opt: EntityPickerOption): string {
  return normalize(
    [opt.label, opt.description ?? "", opt.meta ?? "", ...(opt.searchTokens ?? [])]
      .filter(Boolean)
      .join(" "),
  );
}

const EntityPickerField = forwardRef<HTMLButtonElement, EntityPickerFieldProps>(
  function EntityPickerField(
    {
      label,
      value,
      onChange,
      options,
      modalTitle,
      modalDescription,
      placeholder = "Select…",
      searchPlaceholder = "Search…",
      required,
      disabled,
      name,
      allowClear,
      clearLabel = "(none)",
      createCta,
      loading,
      emptyState,
      className,
      id,
      helperText,
      showCount,
    },
    ref,
  ) {
    const reactId = useId();
    const buttonId = id ?? `picker-${reactId}`;

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const searchRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLUListElement | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    const selected = useMemo(
      () => options.find((opt) => opt.value === value) ?? null,
      [options, value],
    );

    const filtered = useMemo(() => {
      const q = normalize(query.trim());
      if (!q) return options;
      return options.filter((opt) => tokensForOption(opt).includes(q));
    }, [options, query]);

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

    const commit = useCallback(
      (next: string) => {
        onChange(next);
        setOpen(false);
        setQuery("");
      },
      [onChange],
    );

    const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, Math.max(filtered.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        const opt = filtered[activeIndex];
        if (opt && !opt.disabled) {
          e.preventDefault();
          commit(opt.value);
        }
      }
    };

    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        {label && (
          <label
            htmlFor={buttonId}
            className="text-sm font-medium text-zinc-700"
          >
            {label}
            {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
          </label>
        )}
        <button
          ref={ref}
          type="button"
          id={buttonId}
          disabled={disabled}
          onClick={() => {
            setActiveIndex(0);
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
          <span className={cn("flex-1 truncate", !selected && "text-zinc-500")}> 
            {selected ? selected.label : placeholder}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {showCount && options.length > 0 ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                {options.length}
              </span>
            ) : null}
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 text-zinc-400"
              fill="currentColor"
            >
              <path d="M8 11 3 6h10z" />
            </svg>
          </span>
        </button>
        {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
        {helperText ? (
          <p className="text-xs text-zinc-500">{helperText}</p>
        ) : null}

        {open ? (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/40 px-2 pb-2 sm:items-center sm:px-4 sm:pb-0"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${buttonId}-modal-title`}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
            onKeyDown={handleListKeyDown}
          >
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <header className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
                <div>
                  <h2
                    id={`${buttonId}-modal-title`}
                    className="text-base font-semibold text-zinc-900"
                  >
                    {modalTitle}
                  </h2>
                  {modalDescription ? (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {modalDescription}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label="Close"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m4 4 12 12M16 4 4 16"
                    />
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
                    setActiveIndex(0);
                  }}
                  placeholder={searchPlaceholder}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                  aria-label={searchPlaceholder}
                />
              </div>
              {createCta ? (
                <div className="border-b border-zinc-100 bg-zinc-50/70 px-4 py-2">
                  <Link
                    href={createCta.href}
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                  >
                    <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
                      <path d="M10 4a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2h-4v4a1 1 0 1 1-2 0v-4H5a1 1 0 1 1 0-2h4V5a1 1 0 0 1 1-1z" />
                    </svg>
                    {createCta.label}
                  </Link>
                  {createCta.helperText ? (
                    <p className="mt-1 text-[11px] text-zinc-500">{createCta.helperText}</p>
                  ) : null}
                </div>
              ) : null}
              <ul
                ref={listRef}
                className="max-h-[55vh] flex-1 overflow-y-auto"
                role="listbox"
                aria-activedescendant={
                  filtered[activeIndex]
                    ? `${buttonId}-opt-${filtered[activeIndex].value}`
                    : undefined
                }
              >
                {loading ? (
                  <li className="px-4 py-6 text-center text-sm text-zinc-500">
                    Loading…
                  </li>
                ) : filtered.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-zinc-500">
                    {emptyState ?? (
                      <>
                        No matches.
                        {options.length === 0
                          ? " Nothing to pick from yet."
                          : null}
                      </>
                    )}
                  </li>
                ) : (
                  <>
                    {allowClear ? (
                      <li>
                        <button
                          type="button"
                          onClick={() => commit("")}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-zinc-50",
                            !value && "bg-zinc-50",
                          )}
                          role="option"
                          aria-selected={!value}
                        >
                          <span className="text-zinc-500">{clearLabel}</span>
                          {!value ? (
                            <span className="text-xs text-emerald-600">Selected</span>
                          ) : null}
                        </button>
                      </li>
                    ) : null}
                    {filtered.map((opt, idx) => {
                      const isActive = idx === activeIndex;
                      const isSelected = opt.value === value;
                      return (
                        <li key={opt.value}>
                          <button
                            type="button"
                            id={`${buttonId}-opt-${opt.value}`}
                            disabled={opt.disabled}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => commit(opt.value)}
                            className={cn(
                              "flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                              "hover:bg-zinc-50",
                              isActive && "bg-zinc-50",
                              isSelected && "bg-zinc-100/70",
                              opt.disabled && "cursor-not-allowed opacity-60",
                            )}
                            role="option"
                            aria-selected={isSelected}
                          >
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="flex items-center gap-2">
                                <span className="truncate font-medium text-zinc-900">
                                  {opt.label}
                                </span>
                                {isSelected ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                    Selected
                                  </span>
                                ) : null}
                              </span>
                              {opt.description ? (
                                <span className="mt-0.5 truncate text-xs text-zinc-500">
                                  {opt.description}
                                </span>
                              ) : null}
                            </span>
                            {opt.meta ? (
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                  metaToneClasses[opt.metaTone ?? "default"],
                                )}
                              >
                                {opt.meta}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </>
                )}
              </ul>
              <footer className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500">
                <span>
                  {loading
                    ? "Loading…"
                    : `${filtered.length} of ${options.length} shown`}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </footer>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

export { EntityPickerField };
