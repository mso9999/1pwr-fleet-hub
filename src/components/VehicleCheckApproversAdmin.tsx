"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface HrEmp {
  id: number;
  employee_id: string | null;
  name: string;
  email: string;
  role: string;
  type: string;
  country: string | null;
  primary_deployment: string | null;
}

interface SavedApprover {
  id: string;
  email: string;
  display_name: string;
  hr_employee_id: string;
  hr_user_id: number | null;
}

export function VehicleCheckApproversAdmin({
  organizationId,
}: {
  organizationId: string;
}): React.ReactElement {
  const [hrEmployees, setHrEmployees] = useState<HrEmp[]>([]);
  const [saved, setSaved] = useState<SavedApprover[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [loadingHr, setLoadingHr] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hrError, setHrError] = useState<string | null>(null);

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadSaved = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const h = await authHeader();
      const res = await fetch(
        `/api/admin/vehicle-check-approvers?org=${encodeURIComponent(organizationId)}`,
        { headers: { ...h } }
      );
      if (!res.ok) {
        setSaved([]);
        return;
      }
      const data = (await res.json()) as { approvers?: SavedApprover[] };
      const list = data.approvers ?? [];
      setSaved(list);
      setSelectedEmails(new Set(list.map((a) => a.email.toLowerCase())));
    } finally {
      setLoadingSaved(false);
    }
  }, [authHeader, organizationId]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  async function loadFromHr(): Promise<void> {
    setLoadingHr(true);
    setHrError(null);
    setMessage(null);
    try {
      const h = await authHeader();
      const q = countryFilter.trim()
        ? `?country=${encodeURIComponent(countryFilter.trim())}`
        : "";
      const res = await fetch(`/api/admin/hr-directory${q}`, { headers: { ...h } });
      const data = (await res.json()) as {
        employees?: HrEmp[];
        error?: string;
      };
      if (!res.ok) {
        setHrError(data.error || "Failed to load HR directory");
        setHrEmployees([]);
        return;
      }
      setHrEmployees(data.employees ?? []);
      setMessage(
        `Loaded ${data.employees?.length ?? 0} employees from HR. Select who may approve vehicle check exceptions, then Save.`
      );
    } catch {
      setHrError("Network error loading HR directory");
    } finally {
      setLoadingHr(false);
    }
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setMessage(null);
    try {
      const h = await authHeader();
      const byEmail = new Map(hrEmployees.map((e) => [e.email.toLowerCase(), e]));
      const approvers = [...selectedEmails].map((email) => {
        const emp = byEmail.get(email);
        return {
          email,
          displayName: emp?.name || email,
          hrEmployeeId: emp?.employee_id || "",
          hrUserId: emp?.id ?? null,
        };
      });
      const res = await fetch("/api/admin/vehicle-check-approvers", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...h },
        body: JSON.stringify({ organizationId, approvers }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(err.error || "Save failed");
        return;
      }
      const data = (await res.json()) as { approvers?: SavedApprover[] };
      setSaved(data.approvers ?? []);
      setMessage(
        "Saved. These approvers can approve failed checklist exceptions and vehicle mission requests (in addition to fleet lead / manager / admin / superadmin)."
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleEmail(email: string): void {
    const k = email.toLowerCase();
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const filteredHr = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return hrEmployees;
    return hrEmployees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.employee_id || "").toLowerCase().includes(q)
    );
  }, [hrEmployees, filter]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">PR-aligned approvers (HR)</CardTitle>
        <p className="text-sm text-slate-500 font-normal">
          Pull active employees from the HR Portal (biographic fields only), optionally filter by country, then choose
          who may approve failed driver vehicle checks, PR mission approval (pending trip plans), and vehicle requests
          (approve / reject lines in FM). Fleet lead, manager, admin, and superadmin
          can always approve; this list adds more people (matched by email). Allocating a pool vehicle to a request is
          only for the fleet team lead (or superadmin)—see docs/system-cards/missions-vehicle-requests-trips.md.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <Input
            label="Filter HR by country (optional)"
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            placeholder="e.g. LS"
            className="w-40"
          />
          <Button type="button" variant="outline" disabled={loadingHr} onClick={() => void loadFromHr()}>
            {loadingHr ? "Loading HR…" : "Load employees from HR"}
          </Button>
        </div>
        {hrError && <p className="text-sm text-red-600">{hrError}</p>}
        {message && <p className="text-sm text-emerald-800">{message}</p>}

        {hrEmployees.length > 0 && (
          <>
            <Input
              label="Search loaded list"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Name, email, or employee ID"
            />
            <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">
              {filteredHr.map((e) => {
                const key = e.email.toLowerCase();
                const checked = selectedEmails.has(key);
                return (
                  <label
                    key={e.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEmail(e.email)}
                    />
                    <span className="font-medium text-slate-900">{e.name}</span>
                    <span className="text-slate-500 truncate">{e.email}</span>
                    {e.employee_id && (
                      <span className="text-xs text-slate-400 ml-auto shrink-0">{e.employee_id}</span>
                    )}
                  </label>
                );
              })}
            </div>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Save approvers for this org"}
            </Button>
          </>
        )}

        <div className="border-t pt-4">
          <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
            Currently saved ({loadingSaved ? "…" : saved.length})
          </div>
          {!loadingSaved && saved.length === 0 && (
            <p className="text-sm text-slate-400">
              No extra approvers yet — only role-based (fleet lead / manager / admin / superadmin).
            </p>
          )}
          <ul className="text-sm space-y-1">
            {saved.map((r) => (
              <li key={r.id}>
                <span className="font-medium">{r.display_name}</span>{" "}
                <span className="text-slate-500">({r.email})</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
