"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import {
  canManageFleetMechanics,
  canViewFleetMechanicsRegister,
} from "@/lib/fleet-roles";

interface MechanicRow {
  id: string;
  organization_id: string;
  hr_user_id: number | null;
  hr_employee_id: string;
  email: string;
  display_name: string;
  phone: string;
  mechanic_role: string;
  specialties: string;
  status: string;
  notes: string;
  created_at: string;
  created_by_name: string;
  updated_at: string;
  updated_by_name: string;
}

interface HistoryRow {
  id: string;
  entity_type: string;
  entity_id: string;
  organization_id: string;
  action: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  actor_department: string;
  before_json: string;
  after_json: string;
  reason: string;
  created_at: string;
}

interface HrEmp {
  id: number;
  employee_id: string | null;
  name: string;
  email: string;
  role: string;
  country: string | null;
}

const ROLE_OPTIONS = ["mechanic", "trainer", "supervisor", "apprentice"] as const;

export default function AdminFleetMechanicsPage(): React.ReactElement {
  const { user, organizationId } = useAuth();
  const canView = user && canViewFleetMechanicsRegister(user.role, user.department);
  const canManage = user && canManageFleetMechanics(user.role, user.department);

  const [mechanics, setMechanics] = useState<MechanicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<string>("mechanic");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // HR picker (optional)
  const [hrEmployees, setHrEmployees] = useState<HrEmp[]>([]);
  const [loadingHr, setLoadingHr] = useState(false);
  const [hrError, setHrError] = useState<string | null>(null);
  const [hrCountryFilter, setHrCountryFilter] = useState("");
  const [hrFilter, setHrFilter] = useState("");
  const [pickEmail, setPickEmail] = useState("");

  const loadMechanics = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/fleet-mechanics?org=${encodeURIComponent(organizationId)}`,
        { headers: await jsonHeadersWithBearer() }
      );
      const data = (await res.json()) as { mechanics?: MechanicRow[]; error?: string };
      if (!res.ok) {
        setLoadError(data.error || "Could not load mechanics");
        setMechanics([]);
        return;
      }
      setMechanics(data.mechanics ?? []);
    } catch {
      setLoadError("Network error");
      setMechanics([]);
    } finally {
      setLoading(false);
    }
  }, [canView, organizationId]);

  useEffect(() => {
    void loadMechanics();
  }, [loadMechanics]);

  async function loadHrDirectory(): Promise<void> {
    setLoadingHr(true);
    setHrError(null);
    try {
      const q = hrCountryFilter.trim()
        ? `?country=${encodeURIComponent(hrCountryFilter.trim())}`
        : "";
      const res = await fetch(`/api/admin/hr-directory${q}`, {
        headers: await jsonHeadersWithBearer(),
      });
      const data = (await res.json()) as { employees?: HrEmp[]; error?: string };
      if (!res.ok) {
        setHrError(data.error || "Failed to load HR directory");
        setHrEmployees([]);
        return;
      }
      setHrEmployees(data.employees ?? []);
    } catch {
      setHrError("Network error");
    } finally {
      setLoadingHr(false);
    }
  }

  const filteredHr = useMemo(() => {
    const q = hrFilter.trim().toLowerCase();
    if (!q) return hrEmployees;
    return hrEmployees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.employee_id || "").toLowerCase().includes(q)
    );
  }, [hrEmployees, hrFilter]);

  const existingNames = useMemo(
    () => new Set(mechanics.map((m) => m.display_name.toLowerCase())),
    [mechanics]
  );

  async function addManual(): Promise<void> {
    if (!addName.trim()) {
      setAddError("Display name is required");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/fleet-mechanics", {
        method: "POST",
        headers: await jsonHeadersWithBearer(),
        body: JSON.stringify({
          organizationId,
          displayName: addName.trim(),
          email: addEmail.trim(),
          mechanicRole: addRole,
          reason: "Added manually via admin",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setAddError(data.error || "Could not add");
        return;
      }
      setAddName("");
      setAddEmail("");
      setAddRole("mechanic");
      await loadMechanics();
    } finally {
      setAdding(false);
    }
  }

  async function addFromHr(): Promise<void> {
    const emp = hrEmployees.find((e) => e.email.toLowerCase() === pickEmail.toLowerCase());
    if (!emp) return;
    setAdding(true);
    try {
      const res = await fetch("/api/fleet-mechanics", {
        method: "POST",
        headers: await jsonHeadersWithBearer(),
        body: JSON.stringify({
          organizationId,
          displayName: emp.name,
          email: emp.email,
          hrUserId: emp.id,
          hrEmployeeId: emp.employee_id || "",
          mechanicRole: "mechanic",
          reason: "Added from HR directory",
        }),
      });
      if (res.ok) {
        setPickEmail("");
        await loadMechanics();
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error || "Could not add");
      }
    } finally {
      setAdding(false);
    }
  }

  if (!user) {
    return <div className="text-zinc-500">Sign in required.</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Fleet mechanics</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Canonical roster of mechanics used by the Work Order <em>Assign to</em> and Labour
          pickers. Curated in Fleet Hub — no more imports. Every change is recorded in the
          mutation log visible on each card.
        </p>
        {!canManage && (
          <p className="mt-2 text-xs text-amber-800">
            You can view the list. Editing is limited to admin / fleet management (fleet_lead,
            manager) or PR departments DPO, HR, IT, Fleet.
          </p>
        )}
      </div>

      {canManage && (
        <Card className="border-zinc-200">
          <CardHeader>
            <CardTitle className="text-base">Add a mechanic</CardTitle>
            <p className="text-sm text-zinc-500 font-normal">
              Quick-add by name, or pick from the HR directory (same source as the EHS
              register).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4 items-end">
              <Input
                label="Display name *"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Tebesi"
              />
              <Input
                label="Email (optional)"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="name@1pwr.com"
              />
              <Select
                name="mechanicRole"
                label="Role"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <Button type="button" disabled={adding} onClick={() => void addManual()}>
                {adding ? "Adding…" : "Add"}
              </Button>
            </div>
            {addError && <p className="text-sm text-red-600">{addError}</p>}

            <div className="rounded-lg border border-zinc-100 p-3 bg-zinc-50/60 space-y-3">
              <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                Add from HR directory
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <Input
                  label="Country filter (optional)"
                  value={hrCountryFilter}
                  onChange={(e) => setHrCountryFilter(e.target.value)}
                  placeholder="e.g. LS"
                  className="w-40"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingHr}
                  onClick={() => void loadHrDirectory()}
                >
                  {loadingHr ? "Loading HR…" : "Load employees from HR"}
                </Button>
              </div>
              {hrError && <p className="text-sm text-red-600">{hrError}</p>}
              {hrEmployees.length > 0 && (
                <>
                  <Input
                    label="Search loaded list"
                    value={hrFilter}
                    onChange={(e) => setHrFilter(e.target.value)}
                    placeholder="Name, email, or employee ID"
                  />
                  <div className="grid gap-3 sm:grid-cols-2 items-end">
                    <div>
                      <label className="text-sm font-medium text-zinc-700 block mb-1">
                        Employee
                      </label>
                      <select
                        value={pickEmail}
                        onChange={(e) => setPickEmail(e.target.value)}
                        className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm"
                      >
                        <option value="">Select…</option>
                        {filteredHr.map((e) => (
                          <option
                            key={e.id}
                            value={e.email}
                            disabled={existingNames.has(e.name.toLowerCase())}
                          >
                            {e.name} — {e.email}
                            {existingNames.has(e.name.toLowerCase()) ? " (already listed)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      disabled={!pickEmail || adding}
                      onClick={() => void addFromHr()}
                    >
                      {adding ? "Adding…" : "Add from HR"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      )}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : mechanics.length === 0 ? (
        <p className="text-zinc-500">
          No mechanics on the list yet{canManage ? " — add someone above." : "."}
        </p>
      ) : (
        <div className="space-y-3">
          {mechanics.map((m) => (
            <MechanicCard
              key={m.id}
              mechanic={m}
              canManage={!!canManage}
              onSaved={loadMechanics}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MechanicCard({
  mechanic,
  canManage,
  onSaved,
}: {
  mechanic: MechanicRow;
  canManage: boolean;
  onSaved: () => Promise<void>;
}): React.ReactElement {
  const [local, setLocal] = useState({
    displayName: mechanic.display_name,
    email: mechanic.email,
    phone: mechanic.phone,
    mechanicRole: mechanic.mechanic_role || "mechanic",
    specialties: mechanic.specialties,
    status: mechanic.status,
    notes: mechanic.notes,
  });
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    setLocal({
      displayName: mechanic.display_name,
      email: mechanic.email,
      phone: mechanic.phone,
      mechanicRole: mechanic.mechanic_role || "mechanic",
      specialties: mechanic.specialties,
      status: mechanic.status,
      notes: mechanic.notes,
    });
    setDirty(false);
    setReason("");
  }, [mechanic]);

  function mark<K extends keyof typeof local>(k: K, v: (typeof local)[K]): void {
    setLocal((x) => ({ ...x, [k]: v }));
    setDirty(true);
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const res = await fetch(`/api/fleet-mechanics/${mechanic.id}`, {
        method: "PATCH",
        headers: await jsonHeadersWithBearer(),
        body: JSON.stringify({
          ...local,
          reason: reason.trim(),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error || "Could not save");
        return;
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (!confirm(`Remove ${mechanic.display_name} from the fleet mechanics list?`)) return;
    const res = await fetch(`/api/fleet-mechanics/${mechanic.id}`, {
      method: "DELETE",
      headers: await jsonHeadersWithBearer(),
    });
    if (res.ok) await onSaved();
  }

  async function loadHistory(): Promise<void> {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/fleet-mechanics/${mechanic.id}/history`, {
        headers: await jsonHeadersWithBearer(),
      });
      const data = (await res.json()) as { history?: HistoryRow[] };
      setHistory(data.history ?? []);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <Card className={mechanic.status === "active" ? "border-emerald-200" : "border-zinc-200"}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{mechanic.display_name}</CardTitle>
            <p className="text-sm text-zinc-500">
              {mechanic.email || "—"}
              {mechanic.hr_employee_id ? ` · HR ${mechanic.hr_employee_id}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={mechanic.status === "active" ? "success" : "secondary"}>
              {mechanic.status}
            </Badge>
            <Badge variant="info" className="text-[10px]">
              {mechanic.mechanic_role}
            </Badge>
          </div>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Last updated by {mechanic.updated_by_name || "—"} ·{" "}
          {new Date(mechanic.updated_at).toLocaleString()}
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {canManage ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Display name"
                value={local.displayName}
                onChange={(e) => mark("displayName", e.target.value)}
              />
              <Input
                label="Email"
                value={local.email}
                onChange={(e) => mark("email", e.target.value)}
              />
              <Input
                label="Phone"
                value={local.phone}
                onChange={(e) => mark("phone", e.target.value)}
              />
              <Select
                label="Role"
                value={local.mechanicRole}
                onChange={(e) => mark("mechanicRole", e.target.value)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <Select
                label="Status"
                value={local.status}
                onChange={(e) => mark("status", e.target.value)}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </Select>
              <Input
                label="Specialties"
                value={local.specialties}
                onChange={(e) => mark("specialties", e.target.value)}
                placeholder="e.g. 4WD, Cargo trucks"
              />
            </div>
            <Input
              label="Notes (internal)"
              value={local.notes}
              onChange={(e) => mark("notes", e.target.value)}
            />
            <Input
              label="Reason for change (recorded in history)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Promoted to trainer, HR record update"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!dirty || saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-red-600 border-red-200"
                onClick={() => void remove()}
              >
                Remove
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!showHistory) void loadHistory();
                  setShowHistory((s) => !s);
                }}
              >
                {showHistory ? "Hide history" : "View history"}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-sm text-zinc-600 grid gap-1 sm:grid-cols-2">
            <div>Email: {mechanic.email || "—"}</div>
            <div>Phone: {mechanic.phone || "—"}</div>
            <div>Role: {mechanic.mechanic_role}</div>
            <div>Status: {mechanic.status}</div>
            <div className="sm:col-span-2">
              Specialties: {mechanic.specialties || "—"}
            </div>
            <div className="sm:col-span-2">Notes: {mechanic.notes || "—"}</div>
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!showHistory) void loadHistory();
                  setShowHistory((s) => !s);
                }}
              >
                {showHistory ? "Hide history" : "View history"}
              </Button>
            </div>
          </div>
        )}

        {showHistory && (
          <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3 space-y-2">
            <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
              Mutation history
            </div>
            {historyLoading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : history && history.length > 0 ? (
              <ol className="space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="text-xs text-zinc-700 border-b border-zinc-100 pb-2 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {h.action}
                      </Badge>
                      <span className="text-zinc-500">
                        {new Date(h.created_at).toLocaleString()}
                      </span>
                      <span className="text-zinc-900 font-medium">
                        {h.actor_name || h.actor_id || "—"}
                      </span>
                      {h.actor_role && (
                        <span className="text-zinc-500">{h.actor_role}</span>
                      )}
                      {h.actor_department && (
                        <span className="text-zinc-400">· {h.actor_department}</span>
                      )}
                    </div>
                    {h.reason && <p className="mt-1 italic text-zinc-600">“{h.reason}”</p>}
                    <HistoryDiff before={h.before_json} after={h.after_json} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-zinc-500">No history yet.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryDiff({ before, after }: { before: string; after: string }): React.ReactElement | null {
  let b: Record<string, unknown> = {};
  let a: Record<string, unknown> = {};
  try {
    b = (JSON.parse(before) as Record<string, unknown>) ?? {};
  } catch {
    b = {};
  }
  try {
    a = (JSON.parse(after) as Record<string, unknown>) ?? {};
  } catch {
    a = {};
  }
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
  const diffs: Array<{ k: string; before: unknown; after: unknown }> = [];
  for (const k of keys) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      diffs.push({ k, before: b[k], after: a[k] });
    }
  }
  if (diffs.length === 0) return null;
  return (
    <ul className="mt-1 grid gap-0.5 text-[11px] text-zinc-600">
      {diffs.map((d) => (
        <li key={d.k} className="truncate">
          <span className="font-mono text-zinc-500">{d.k}</span>:{" "}
          <span className="text-red-600 line-through">{formatValue(d.before)}</span> →{" "}
          <span className="text-emerald-700">{formatValue(d.after)}</span>
        </li>
      ))}
    </ul>
  );
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}
