"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EntityPickerField,
  type EntityPickerOption,
} from "@/components/ui/entity-picker";
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
  /** 'any' | 'automatic_only' — AT-only derate badge shown in the list. */
  transmissionScope?: string;
};

type NonCompliantRow = {
  id: string;
  displayName: string;
  email: string;
  reasons: string[];
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
  /** Shown under the trigger. */
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<OptionRow[]>([]);
  const [nonCompliant, setNonCompliant] = useState<NonCompliantRow[]>([]);

  const countryLabel = ORG_LABELS[organizationId] ?? organizationId.replace(/^1pwr_/i, "").replace(/_/g, " ");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const headers = await jsonHeadersWithBearer();
        const params = new URLSearchParams({
          org: organizationId,
          category,
        });
        const res = await fetch(`/api/ehs-approved-drivers/options?${params.toString()}`, { headers });
        const j = (await res.json()) as {
          options?: OptionRow[];
          nonCompliant?: NonCompliantRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(j.error || "Could not load drivers");
          setReady([]);
          setNonCompliant([]);
          return;
        }
        setReady(Array.isArray(j.options) ? j.options : []);
        setNonCompliant(Array.isArray(j.nonCompliant) ? j.nonCompliant : []);
      } catch {
        if (!cancelled) {
          setError("Network error");
          setReady([]);
          setNonCompliant([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, category]);

  const options = useMemo<EntityPickerOption[]>(() => {
    const readyOpts: EntityPickerOption[] = ready.map((o) => {
      const atOnly = o.transmissionScope === "automatic_only";
      const meta = atOnly ? "AT only" : o.isTrainer ? "Trainer" : "Ready";
      return {
        value: o.id,
        label: o.displayName,
        description: o.email,
        meta,
        metaTone: atOnly ? "info" : "success",
        searchTokens: [o.email, o.hrEmployeeId, atOnly ? "AT only automatic" : ""],
      };
    });
    const blockedOpts: EntityPickerOption[] = nonCompliant.map((o) => {
      const reason = (o.reasons || []).filter(Boolean).join(" · ");
      return {
        value: o.id,
        label: o.displayName,
        description: reason ? `${o.email} — ${reason}` : o.email,
        meta: "Not ready",
        metaTone: "warning",
        disabled: true,
        searchTokens: [o.email, ...(o.reasons || [])],
      };
    });
    return [...readyOpts, ...blockedOpts];
  }, [ready, nonCompliant]);

  const countLine = !loading && !error
    ? `${ready.length} ready to select${
        nonCompliant.length > 0
          ? ` · ${nonCompliant.length} on the register but not yet selectable`
          : ""
      }`
    : error
      ? error
      : "Loading drivers…";

  return (
    <EntityPickerField
      label={label}
      required={required}
      disabled={disabled}
      value={value?.id ?? ""}
      onChange={(id) => {
        if (!id) {
          onChange(null);
          return;
        }
        const row = ready.find((r) => r.id === id);
        if (row) {
          onChange({ id: row.id, displayName: row.displayName, email: row.email });
        }
      }}
      options={options}
      loading={loading}
      showCount
      modalTitle="Approved driver for this organisation"
      modalDescription={
        <>
          Register scope: <strong className="font-medium text-zinc-700">{countryLabel}</strong> ({organizationId}).
          The full EHS list is searchable. Only operators who are fully compliant for on-road fleet can be selected;
          others stay visible with the reason they are blocked.
        </>
      }
      searchPlaceholder="Search name, email, or HR id…"
      placeholder="Select from EHS register…"
      helperText={
        <>
          {helperText ? <span className="block">{helperText}</span> : null}
          <span className={error ? "text-red-700" : undefined}>{countLine}</span>
        </>
      }
      emptyState={
        <span>
          No EHS register rows for {countryLabel}. Ask EHS to add drivers, or switch organisation in the sidebar.
        </span>
      }
    />
  );
}
