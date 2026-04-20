"use client";

import { useEffect, useState } from "react";

/**
 * Dropdown with preset options plus an "Other (write in)…" entry that reveals a text field.
 * Drop-in for assignees / shops / any curated short list that still needs occasional write-ins.
 */
export function AssigneeCombo({
  name,
  label,
  value,
  onChange,
  options,
  allowEmpty = true,
  emptyLabel = "Unassigned",
  otherPlaceholder = "Type a name",
  required = false,
  className,
}: {
  /** If set, a hidden input with this name carries the current value for FormData consumers. */
  name?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  allowEmpty?: boolean;
  emptyLabel?: string;
  otherPlaceholder?: string;
  required?: boolean;
  className?: string;
}): React.ReactElement {
  const isWriteIn = (v: string): boolean => v !== "" && !options.includes(v);
  const [mode, setMode] = useState<"preset" | "other">(isWriteIn(value) ? "other" : "preset");

  // Keep mode in sync when the value is changed externally (e.g. after loading a record).
  useEffect(() => {
    setMode(isWriteIn(value) ? "other" : "preset");
    // We intentionally depend on value + options; isWriteIn is a pure reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options]);

  const selectValue = mode === "other" ? "__other__" : value;

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label className="text-sm font-medium text-zinc-700">{label}</label>
      <select
        value={selectValue}
        required={required}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__other__") {
            setMode("other");
            onChange("");
          } else {
            setMode("preset");
            onChange(v);
          }
        }}
        className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__other__">Other (write in)…</option>
      </select>
      {mode === "other" && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={otherPlaceholder}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          autoFocus
          required={required}
        />
      )}
      {name && <input type="hidden" name={name} value={value} readOnly />}
    </div>
  );
}
