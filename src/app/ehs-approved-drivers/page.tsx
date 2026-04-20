"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { MediaUpload } from "@/components/MediaUpload";
import { EHS_DRIVER_MEDIA_ENTITY } from "@/lib/ehs-driver-media";
import {
  canViewEhsApprovedDriversRegister,
  canManageEhsApprovedDrivers,
} from "@/lib/fleet-roles";
import { evaluateLicenseContinuity } from "@/lib/ehs-approved-drivers";

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

interface DriverRecord {
  id: string;
  display_name: string;
  email: string;
  hr_user_id: number | null;
  hr_employee_id: string;
  license_valid_from: string;
  license_expiry: string;
  written_test_passed_at: string;
  road_test_passed_at: string;
  eye_test_passed_at: string;
  reaction_test_passed_at: string;
  status: string;
  notes: string;
  updated_at: string;
  updated_by_name: string;
  license_media_count: number;
  fully_compliant: boolean;
}

export default function EhsApprovedDriversPage(): React.ReactElement {
  const { organizationId, user } = useAuth();
  const canView = user && canViewEhsApprovedDriversRegister(user.role, user.department);
  const canEdit = user && canManageEhsApprovedDrivers(user.role, user.department);

  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [hrEmployees, setHrEmployees] = useState<HrEmp[]>([]);
  const [countryFilter, setCountryFilter] = useState("");
  const [loadingHr, setLoadingHr] = useState(false);
  const [hrError, setHrError] = useState<string | null>(null);
  const [pickEmail, setPickEmail] = useState("");
  const [hrFilter, setHrFilter] = useState("");
  const [adding, setAdding] = useState(false);

  const loadDrivers = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/ehs-approved-drivers?org=${encodeURIComponent(organizationId)}`, {
        headers: await jsonHeadersWithBearer(),
      });
      const data = (await res.json()) as { drivers?: DriverRecord[]; error?: string };
      if (!res.ok) {
        setLoadError(data.error || "Could not load register");
        setDrivers([]);
        return;
      }
      setDrivers(data.drivers ?? []);
    } catch {
      setLoadError("Network error");
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, [canView, organizationId]);

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

  async function loadHr(): Promise<void> {
    setLoadingHr(true);
    setHrError(null);
    try {
      const q = countryFilter.trim()
        ? `?country=${encodeURIComponent(countryFilter.trim())}`
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

  async function addFromHr(): Promise<void> {
    const emp = hrEmployees.find((e) => e.email.toLowerCase() === pickEmail.toLowerCase());
    if (!emp) return;
    setAdding(true);
    try {
      const res = await fetch("/api/ehs-approved-drivers", {
        method: "POST",
        headers: await jsonHeadersWithBearer(),
        body: JSON.stringify({
          organizationId,
          email: emp.email,
          displayName: emp.name,
          hrUserId: emp.id,
          hrEmployeeId: emp.employee_id || "",
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error || "Could not add driver");
        return;
      }
      setPickEmail("");
      await loadDrivers();
    } finally {
      setAdding(false);
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

  const existingEmails = useMemo(
    () => new Set(drivers.map((d) => d.email.toLowerCase())),
    [drivers]
  );

  if (!user) {
    return <div className="text-zinc-500">Sign in required.</div>;
  }

  if (!canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Sign in to Fleet Hub to view the approved drivers register.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl" data-tutorial="tutorial-ehs-page">
      <p className="text-sm text-zinc-600 leading-relaxed">
        Read-only list of drivers approved to operate 1PWR fleet vehicles in this organisation. Staff with the{" "}
        <strong>EHS</strong> department in PR (synced to Fleet Hub) maintain the list from the HR employee directory:
        license scan on file, license dates that show{" "}
        <strong>continuous validity for at least the past two years</strong>, and pass dates for written, road, eye,
        and reaction tests.{" "}
        <strong>Everyone with a Fleet Hub login can view</strong> the register; only EHS department users and admins
        can edit it.
      </p>

      {canEdit && (
        <Card data-tutorial="tutorial-ehs-hr-loader">
          <CardHeader>
            <CardTitle className="text-base">Add driver from HR directory</CardTitle>
            <p className="text-sm text-zinc-500 font-normal">
              Load employees from the HR Portal (same source as PR), select a person, then add them to this
              organization&apos;s register.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end" data-tutorial="tutorial-ehs-country-filter">
              <Input
                label="Filter HR by country (optional)"
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                placeholder="e.g. LS"
                className="w-40"
              />
              <Button type="button" variant="outline" disabled={loadingHr} onClick={() => void loadHr()}>
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
                <div className="grid gap-3 sm:grid-cols-2 items-end" data-tutorial="tutorial-ehs-hr-picker">
                  <div>
                    <label className="text-sm font-medium text-zinc-700 block mb-1">Employee</label>
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
                          disabled={existingEmails.has(e.email.toLowerCase())}
                        >
                          {e.name} — {e.email}
                          {existingEmails.has(e.email.toLowerCase()) ? " (already listed)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    disabled={!pickEmail || adding || existingEmails.has(pickEmail.toLowerCase())}
                    onClick={() => void addFromHr()}
                  >
                    {adding ? "Adding…" : "Add to register"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
      )}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : drivers.length === 0 ? (
        <p className="text-zinc-500">No drivers on the register yet{canEdit ? " — add someone from HR above." : "."}</p>
      ) : (
        <div className="space-y-4" data-tutorial="tutorial-ehs-drivers-list">
          {drivers.map((d, idx) => (
            <DriverCard
              key={d.id}
              driver={d}
              canEdit={!!canEdit}
              userName={user.name || user.email}
              userId={user.id}
              onSaved={loadDrivers}
              tutorialFirst={idx === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DriverCard({
  driver: d,
  canEdit,
  userName,
  userId,
  onSaved,
  tutorialFirst,
}: {
  driver: DriverRecord;
  canEdit: boolean;
  userName: string;
  userId: string;
  onSaved: () => Promise<void>;
  tutorialFirst?: boolean;
}): React.ReactElement {
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState({
    licenseValidFrom: d.license_valid_from || "",
    licenseExpiry: d.license_expiry || "",
    written: d.written_test_passed_at || "",
    road: d.road_test_passed_at || "",
    eye: d.eye_test_passed_at || "",
    reaction: d.reaction_test_passed_at || "",
    status: d.status || "active",
    notes: d.notes || "",
  });

  useEffect(() => {
    setLocal({
      licenseValidFrom: d.license_valid_from || "",
      licenseExpiry: d.license_expiry || "",
      written: d.written_test_passed_at || "",
      road: d.road_test_passed_at || "",
      eye: d.eye_test_passed_at || "",
      reaction: d.reaction_test_passed_at || "",
      status: d.status || "active",
      notes: d.notes || "",
    });
  }, [d]);

  const licHint = evaluateLicenseContinuity(local.licenseValidFrom, local.licenseExpiry);

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const res = await fetch(`/api/ehs-approved-drivers/${d.id}`, {
        method: "PATCH",
        headers: await jsonHeadersWithBearer(),
        body: JSON.stringify({
          licenseValidFrom: local.licenseValidFrom,
          licenseExpiry: local.licenseExpiry,
          writtenTestPassedAt: local.written,
          roadTestPassedAt: local.road,
          eyeTestPassedAt: local.eye,
          reactionTestPassedAt: local.reaction,
          status: local.status,
          notes: local.notes,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error || "Save failed");
        return;
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (!confirm(`Remove ${d.display_name} from the register?`)) return;
    const res = await fetch(`/api/ehs-approved-drivers/${d.id}`, {
      method: "DELETE",
      headers: await jsonHeadersWithBearer(),
    });
    if (res.ok) await onSaved();
  }

  return (
    <Card
      className={d.fully_compliant ? "border-emerald-200" : "border-zinc-200"}
      data-tutorial={tutorialFirst ? "tutorial-ehs-driver-card" : undefined}
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{d.display_name}</CardTitle>
            <p className="text-sm text-zinc-500">{d.email}</p>
            {d.hr_employee_id && (
              <p className="text-xs text-zinc-400 mt-0.5">HR ID: {d.hr_employee_id}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={d.status === "active" ? "success" : "secondary"}>{d.status}</Badge>
            {d.fully_compliant ? (
              <Badge variant="success">Ready for fleet use</Badge>
            ) : (
              <Badge variant="warning">Incomplete</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <span className="text-zinc-500">License scan</span>
            <div className="font-medium mt-0.5">
              {d.license_media_count > 0 ? `${d.license_media_count} file(s)` : "None uploaded"}
            </div>
          </div>
          <div>
            <span className="text-zinc-500">Last updated</span>
            <div className="font-medium mt-0.5">
              {d.updated_by_name ? `${d.updated_by_name} · ` : ""}
              {d.updated_at ? new Date(d.updated_at).toLocaleString() : "—"}
            </div>
          </div>
        </div>

        {canEdit ? (
          <>
            <div
              className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 space-y-2"
              data-tutorial={tutorialFirst ? "tutorial-ehs-license-upload" : undefined}
            >
              <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">License scan (upload)</div>
              <MediaUpload
                entityType={EHS_DRIVER_MEDIA_ENTITY}
                entityId={d.id}
                uploadedByName={userName}
                uploadedById={userId}
                defaultCategory="document"
              />
            </div>

            <div
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              data-tutorial={tutorialFirst ? "tutorial-ehs-tests-grid" : undefined}
            >
              <Input
                label="License valid from *"
                type="date"
                value={local.licenseValidFrom}
                onChange={(e) => setLocal((x) => ({ ...x, licenseValidFrom: e.target.value }))}
              />
              <Input
                label="License expiry *"
                type="date"
                value={local.licenseExpiry}
                onChange={(e) => setLocal((x) => ({ ...x, licenseExpiry: e.target.value }))}
              />
              <Input
                label="Written test passed"
                type="date"
                value={local.written}
                onChange={(e) => setLocal((x) => ({ ...x, written: e.target.value }))}
              />
              <Input
                label="Road test passed"
                type="date"
                value={local.road}
                onChange={(e) => setLocal((x) => ({ ...x, road: e.target.value }))}
              />
              <Input
                label="Eye test passed"
                type="date"
                value={local.eye}
                onChange={(e) => setLocal((x) => ({ ...x, eye: e.target.value }))}
              />
              <Input
                label="Reaction test passed"
                type="date"
                value={local.reaction}
                onChange={(e) => setLocal((x) => ({ ...x, reaction: e.target.value }))}
              />
              <div>
                <label className="text-sm font-medium text-zinc-700 block mb-1">Status</label>
                <select
                  value={local.status}
                  onChange={(e) => setLocal((x) => ({ ...x, status: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm"
                >
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                </select>
              </div>
            </div>
            <Input
              label="Notes"
              value={local.notes}
              onChange={(e) => setLocal((x) => ({ ...x, notes: e.target.value }))}
              placeholder="Internal notes (optional)"
            />
            <p className={`text-xs ${licHint.ok ? "text-emerald-700" : "text-amber-800"}`}>{licHint.detail}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save record"}
              </Button>
              <Button type="button" variant="outline" className="text-red-600 border-red-200" onClick={() => void remove()}>
                Remove from register
              </Button>
            </div>
          </>
        ) : (
          <div className="text-sm text-zinc-600 grid gap-1 sm:grid-cols-2">
            <div>License from: {d.license_valid_from || "—"}</div>
            <div>License expiry: {d.license_expiry || "—"}</div>
            <div>Written: {d.written_test_passed_at || "—"}</div>
            <div>Road: {d.road_test_passed_at || "—"}</div>
            <div>Eye: {d.eye_test_passed_at || "—"}</div>
            <div>Reaction: {d.reaction_test_passed_at || "—"}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
