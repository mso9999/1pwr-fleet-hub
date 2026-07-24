"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { jsonHeadersWithBearer } from "@/lib/client-bearer";
import { MediaUpload } from "@/components/MediaUpload";
import {
  EHS_DRIVER_MEDIA_ENTITY,
  EHS_OPERATOR_AUTH_MEDIA_ENTITY,
} from "@/lib/ehs-driver-media";
import {
  canViewEhsApprovedDriversRegister,
  canManageEhsApprovedDrivers,
} from "@/lib/fleet-roles";
import { evaluateLicenseContinuity } from "@/lib/ehs-approved-drivers";
import {
  CATEGORY_GROUP_ORDER,
  categoriesInGroup,
  getOperatorCategory,
  type AssessmentResult,
  type OperatorCategoryCode,
  type OperatorCategoryMeta,
  type OperatorGrant,
} from "@/lib/ehs-operator-categories";
import { useLocaleContext } from "@/i18n/locale-context";

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

interface AuthorizationRow {
  id: string;
  operator_id: string;
  category_code: OperatorCategoryCode;
  grant: OperatorGrant;
  notes: string;
  training_media_count: number;
  ready: boolean;
  grant_is_trainer: boolean;
  created_at: string;
  updated_at: string;
}

interface OperatorRecord {
  id: string;
  display_name: string;
  email: string;
  hr_user_id: number | null;
  hr_employee_id: string;
  license_valid_from: string;
  license_expiry: string;
  license_originally_issued: string;
  written_test_passed_at: string;
  road_test_passed_at: string;
  eye_test_passed_at: string;
  reaction_test_passed_at: string;
  vision_result: AssessmentResult;
  hearing_result: AssessmentResult;
  reaction_result: AssessmentResult;
  written_offroad_result: AssessmentResult;
  practical_result: AssessmentResult;
  status: string;
  notes: string;
  updated_at: string;
  updated_by_name: string;
  attestation: {
    by: string;
    at: string | null;
    isFresh: boolean;
  };
  license_media_count: number;
  fully_compliant: boolean;
  authorizations: AuthorizationRow[];
  category_readiness: Record<string, boolean>;
}

export default function EhsApprovedDriversPage(): React.ReactElement {
  const { organizationId, user } = useAuth();
  const canView = user && canViewEhsApprovedDriversRegister(user.role, user.department);
  const canEdit = user && canManageEhsApprovedDrivers(user.role, user.department);

  const [operators, setOperators] = useState<OperatorRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [hrEmployees, setHrEmployees] = useState<HrEmp[]>([]);
  const [countryFilter, setCountryFilter] = useState("");
  const [loadingHr, setLoadingHr] = useState(false);
  const [hrError, setHrError] = useState<string | null>(null);
  const [pickEmail, setPickEmail] = useState("");
  const [hrFilter, setHrFilter] = useState("");
  const [adding, setAdding] = useState(false);

  const loadOperators = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/ehs-approved-drivers?org=${encodeURIComponent(organizationId)}`,
        { headers: await jsonHeadersWithBearer() }
      );
      const data = (await res.json()) as { drivers?: OperatorRecord[]; error?: string };
      if (!res.ok) {
        setLoadError(data.error || "Could not load register");
        setOperators([]);
        return;
      }
      setOperators(data.drivers ?? []);
    } catch {
      setLoadError("Network error");
      setOperators([]);
    } finally {
      setLoading(false);
    }
  }, [canView, organizationId]);

  useEffect(() => {
    void loadOperators();
  }, [loadOperators]);

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
        alert(err.error || "Could not add operator");
        return;
      }
      setPickEmail("");
      await loadOperators();
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
    () => new Set(operators.map((d) => d.email.toLowerCase())),
    [operators]
  );

  if (!user) {
    return <div className="text-zinc-500">Sign in required.</div>;
  }

  if (!canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Sign in to Fleet Hub to view the approved operator register.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl" data-tutorial="tutorial-ehs-page">
      <p className="text-sm text-zinc-600 leading-relaxed">
        D018 approved operator register. Every signed-in user can view the list. The{" "}
        <strong>EHS department</strong> (synced from PR) and admins maintain the five physical and
        proficiency assessments, the per-category authorizations matrix, and the EHS sign-off on
        each record.
      </p>

      {canEdit && (
        <Card data-tutorial="tutorial-ehs-hr-loader">
          <CardHeader>
            <CardTitle className="text-base">Add operator from HR directory</CardTitle>
            <p className="text-sm text-zinc-500 font-normal">
              Load employees from the HR Portal (same source as PR), select a person, then add them
              to this organization&apos;s register. The matrix of 16 categories is then populated with
              default &quot;none&quot; grants so EHS can authorise individual equipment types.
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
            {hrError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 space-y-1">
                <p>
                  <strong>HR directory unavailable:</strong> {hrError}
                </p>
                <p className="text-xs">
                  You can still add an operator using the manual form below.
                </p>
              </div>
            )}
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

      {canEdit && (
        <ManualAddOperatorCard
          organizationId={organizationId}
          existingEmails={existingEmails}
          onAdded={loadOperators}
        />
      )}

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
      )}

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : operators.length === 0 ? (
        <p className="text-zinc-500">
          No operators on the register yet
          {canEdit
            ? " — use the HR loader or the manual-add form above."
            : "."}
        </p>
      ) : (
        <div className="space-y-4" data-tutorial="tutorial-ehs-drivers-list">
          {operators.map((d, idx) => (
            <OperatorCard
              key={d.id}
              operator={d}
              canEdit={!!canEdit}
              userName={user.name || user.email}
              userId={user.id}
              onSaved={loadOperators}
              tutorialFirst={idx === 0}
              defaultExpanded={idx === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const ASSESSMENT_VALUES: AssessmentResult[] = ["pass", "fail", "pending"];

function OperatorCard({
  operator: d,
  canEdit,
  userName,
  userId,
  onSaved,
  tutorialFirst,
  defaultExpanded = false,
}: {
  operator: OperatorRecord;
  canEdit: boolean;
  userName: string;
  userId: string;
  onSaved: () => Promise<void>;
  tutorialFirst?: boolean;
  /** First row starts open so guided tutorial steps can target nested fields. */
  defaultExpanded?: boolean;
}): React.ReactElement {
  const { t } = useLocaleContext();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [saving, setSaving] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [attestChecked, setAttestChecked] = useState(d.attestation.isFresh);
  const [local, setLocal] = useState({
    licenseValidFrom: d.license_valid_from || "",
    licenseExpiry: d.license_expiry || "",
    licenseOriginallyIssued: d.license_originally_issued || "",
    vision: d.vision_result || "pending",
    hearing: d.hearing_result || "pending",
    reaction: d.reaction_result || "pending",
    written: d.written_offroad_result || "pending",
    practical: d.practical_result || "pending",
    status: d.status || "active",
    notes: d.notes || "",
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocal({
      licenseValidFrom: d.license_valid_from || "",
      licenseExpiry: d.license_expiry || "",
      licenseOriginallyIssued: d.license_originally_issued || "",
      vision: d.vision_result || "pending",
      hearing: d.hearing_result || "pending",
      reaction: d.reaction_result || "pending",
      written: d.written_offroad_result || "pending",
      practical: d.practical_result || "pending",
      status: d.status || "active",
      notes: d.notes || "",
    });
    setAttestChecked(d.attestation.isFresh);
    setDirty(false);
  }, [d]);

  function mark<K extends keyof typeof local>(key: K, value: (typeof local)[K]): void {
    setLocal((x) => ({ ...x, [key]: value }));
    setDirty(true);
    setAttestChecked(false);
  }

  const licHint = evaluateLicenseContinuity(
    local.licenseValidFrom,
    local.licenseExpiry,
    new Date(),
    local.licenseOriginallyIssued
  );

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const res = await fetch(`/api/ehs-approved-drivers/${d.id}`, {
        method: "PATCH",
        headers: await jsonHeadersWithBearer(),
        body: JSON.stringify({
          licenseValidFrom: local.licenseValidFrom,
          licenseExpiry: local.licenseExpiry,
          licenseOriginallyIssued: local.licenseOriginallyIssued,
          visionResult: local.vision,
          hearingResult: local.hearing,
          reactionResult: local.reaction,
          writtenOffroadResult: local.written,
          practicalResult: local.practical,
          status: local.status,
          notes: local.notes,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error || "Could not save");
        return;
      }
      setDirty(false);
      if (attestChecked) {
        const attRes = await fetch(`/api/ehs-approved-drivers/${d.id}/attest`, {
          method: "POST",
          headers: await jsonHeadersWithBearer(),
        });
        if (!attRes.ok) {
          const attErr = (await attRes.json().catch(() => ({}))) as { error?: string };
          alert(attErr.error || "Saved, but attestation failed — please try attesting again.");
        }
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function attestOnly(): Promise<void> {
    setAttesting(true);
    try {
      const res = await fetch(`/api/ehs-approved-drivers/${d.id}/attest`, {
        method: "POST",
        headers: await jsonHeadersWithBearer(),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(err.error || "Could not attest — please try again.");
        return;
      }
      await onSaved();
    } finally {
      setAttesting(false);
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

  const fleetReady = d.category_readiness["fleet_vehicle_onroad"] ?? false;
  const panelId = `ehs-driver-detail-${d.id}`;

  return (
    <Card className={fleetReady ? "border-emerald-200" : "border-zinc-200"}>
      <CardHeader className="space-y-0 p-0">
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-t-xl p-6 text-left outline-none transition-colors hover:bg-zinc-50/90 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
          aria-expanded={expanded}
          aria-controls={panelId}
          id={`ehs-driver-trigger-${d.id}`}
          data-tutorial={tutorialFirst ? "tutorial-ehs-driver-card" : undefined}
          onClick={() => setExpanded((x) => !x)}
        >
          <ChevronDown
            className={`mt-0.5 h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{d.display_name}</CardTitle>
                <p className="text-sm text-zinc-500">{d.email}</p>
                {d.hr_employee_id && (
                  <p className="text-xs text-zinc-400 mt-0.5">HR ID: {d.hr_employee_id}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Badge variant={d.status === "active" ? "success" : "secondary"}>{d.status}</Badge>
                {fleetReady ? (
                  <Badge variant="success">Ready (fleet vehicle)</Badge>
                ) : (
                  <Badge variant="warning">Draft</Badge>
                )}
              </div>
            </div>
            {!expanded && (
              <p className="text-xs text-zinc-500">
                License expiry: {d.license_expiry || "—"}
                {d.license_media_count > 0 ? ` · ${d.license_media_count} licence file(s)` : ""}
              </p>
            )}
            {!expanded && !d.attestation.isFresh && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                {d.attestation.at
                  ? t("ehsOperator.attestation.staleBanner")
                  : t("ehsOperator.attestation.neverAttested")}
              </div>
            )}
            {!expanded && d.attestation.isFresh && d.attestation.at && (
              <p className="text-xs text-zinc-500">
                {t("ehsOperator.attestation.lastAttestedBy")}: {d.attestation.by || "—"} ·{" "}
                {new Date(d.attestation.at).toLocaleString()}
              </p>
            )}
          </div>
        </button>
        {expanded && !d.attestation.isFresh && (
          <div className="mx-6 mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            {d.attestation.at
              ? t("ehsOperator.attestation.staleBanner")
              : t("ehsOperator.attestation.neverAttested")}
          </div>
        )}
        {expanded && d.attestation.isFresh && d.attestation.at && (
          <p className="mx-6 mb-2 text-xs text-zinc-500">
            {t("ehsOperator.attestation.lastAttestedBy")}: {d.attestation.by || "—"} ·{" "}
            {new Date(d.attestation.at).toLocaleString()}
          </p>
        )}
      </CardHeader>
      {expanded && (
      <CardContent
        id={panelId}
        role="region"
        aria-labelledby={`ehs-driver-trigger-${d.id}`}
        className="space-y-4"
      >
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
                onChange={(e) => mark("licenseValidFrom", e.target.value)}
              />
              <Input
                label="License expiry *"
                type="date"
                value={local.licenseExpiry}
                onChange={(e) => mark("licenseExpiry", e.target.value)}
              />
              <Input
                label="License originally issued"
                type="date"
                value={local.licenseOriginallyIssued}
                onChange={(e) => mark("licenseOriginallyIssued", e.target.value)}
              />
              <div>
                <label className="text-sm font-medium text-zinc-700 block mb-1">Status</label>
                <select
                  value={local.status}
                  onChange={(e) => mark("status", e.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm"
                >
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                </select>
              </div>
            </div>

            <div
              className="rounded-lg border border-zinc-200 bg-white p-3 space-y-3"
              data-tutorial={tutorialFirst ? "tutorial-ehs-assessments" : undefined}
            >
              <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                Physical assessment &amp; proficiency
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <AssessmentControl label="Vision" value={local.vision} onChange={(v) => mark("vision", v)} />
                <AssessmentControl label="Hearing" value={local.hearing} onChange={(v) => mark("hearing", v)} />
                <AssessmentControl label="Reaction" value={local.reaction} onChange={(v) => mark("reaction", v)} />
                <AssessmentControl
                  label="Written (off-road)"
                  value={local.written}
                  onChange={(v) => mark("written", v)}
                />
                <AssessmentControl label="Practical" value={local.practical} onChange={(v) => mark("practical", v)} />
              </div>
            </div>

            <Input
              label="Notes"
              value={local.notes}
              onChange={(e) => mark("notes", e.target.value)}
              placeholder="Internal notes (e.g. 'Only approved for automatic vehicles')"
            />
            <p className={`text-xs ${licHint.ok ? "text-emerald-700" : "text-amber-800"}`}>{licHint.detail}</p>

            <AuthorizationsMatrix
              operatorId={d.id}
              authorizations={d.authorizations}
              userName={userName}
              userId={userId}
              tutorialFirst={!!tutorialFirst}
              onChanged={async () => {
                setAttestChecked(false);
                await onSaved();
              }}
            />

            <div
              className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2"
              data-tutorial={tutorialFirst ? "tutorial-ehs-attest" : undefined}
            >
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={attestChecked}
                  onChange={(e) => setAttestChecked(e.target.checked)}
                />
                <span>{t("ehsOperator.attestation.checkboxLabel")}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {dirty ? (
                  <Button type="button" disabled={saving || !attestChecked} onClick={() => void save()}>
                    {saving ? "Saving…" : t("ehsOperator.attestation.attestButton")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={attesting || !attestChecked || d.attestation.isFresh}
                    onClick={() => void attestOnly()}
                  >
                    {attesting
                      ? "Attesting…"
                      : d.attestation.isFresh
                      ? "Already attested"
                      : t("ehsOperator.attestation.attestButton")}
                  </Button>
                )}
                <Button type="button" variant="outline" className="text-red-600 border-red-200" onClick={() => void remove()}>
                  Remove from register
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-zinc-600 grid gap-1 sm:grid-cols-2">
              <div>License from: {d.license_valid_from || "—"}</div>
              <div>License expiry: {d.license_expiry || "—"}</div>
              <div>Originally issued: {d.license_originally_issued || "—"}</div>
              <div>Vision: {d.vision_result}</div>
              <div>Hearing: {d.hearing_result}</div>
              <div>Reaction: {d.reaction_result}</div>
              <div>Written (off-road): {d.written_offroad_result}</div>
              <div>Practical: {d.practical_result}</div>
            </div>
            <AuthorizationsSummary authorizations={d.authorizations} />
          </>
        )}

        <HistoryPanel operatorId={d.id} />
      </CardContent>
      )}
    </Card>
  );
}

function HistoryPanel({ operatorId }: { operatorId: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Array<{
    id: string;
    action: string;
    actor_name: string;
    actor_role: string;
    actor_department: string;
    before_json: string;
    after_json: string;
    reason: string;
    created_at: string;
  }> | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch(`/api/ehs-approved-drivers/${operatorId}/history`, {
        headers: await jsonHeadersWithBearer(),
      });
      const data = (await res.json()) as { history?: typeof rows };
      setRows(data.history ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pt-3 border-t border-zinc-100">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          if (!open) void load();
          setOpen((o) => !o);
        }}
      >
        {open ? "Hide history" : "View history"}
      </Button>
      {open && (
        <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50/50 p-3 space-y-2">
          <div className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
            Mutation history
          </div>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : rows && rows.length > 0 ? (
            <ol className="space-y-2">
              {rows.map((h) => (
                <li
                  key={h.id}
                  className="text-xs text-zinc-700 border-b border-zinc-100 pb-2 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {h.action}
                    </Badge>
                    <span className="text-zinc-500">
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                    <span className="text-zinc-900 font-medium">{h.actor_name || "—"}</span>
                    {h.actor_role && <span className="text-zinc-500">{h.actor_role}</span>}
                    {h.actor_department && (
                      <span className="text-zinc-400">· {h.actor_department}</span>
                    )}
                  </div>
                  {h.reason && <p className="mt-1 italic text-zinc-600">“{h.reason}”</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-zinc-500">No history yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AssessmentControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AssessmentResult;
  onChange: (v: AssessmentResult) => void;
}): React.ReactElement {
  const { t } = useLocaleContext();
  return (
    <div>
      <label className="text-xs font-medium text-zinc-600 block mb-1">{label}</label>
      <div className="flex rounded-lg border border-zinc-200 overflow-hidden">
        {ASSESSMENT_VALUES.map((v) => {
          const selected = value === v;
          const base = "flex-1 px-2 py-1.5 text-xs font-medium touch-manipulation min-h-[36px]";
          const active =
            v === "pass"
              ? "bg-emerald-600 text-white"
              : v === "fail"
              ? "bg-red-500 text-white"
              : "bg-zinc-200 text-zinc-800";
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={`${base} ${selected ? active : "bg-white text-zinc-500 hover:bg-zinc-50"}`}
            >
              {t(`ehsOperator.assessments.${v}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AuthorizationsMatrix({
  operatorId,
  authorizations,
  userName,
  userId,
  tutorialFirst,
  onChanged,
}: {
  operatorId: string;
  authorizations: AuthorizationRow[];
  userName: string;
  userId: string;
  tutorialFirst: boolean;
  onChanged: () => void | Promise<void>;
}): React.ReactElement {
  const { t } = useLocaleContext();

  async function updateAuthorization(
    categoryCode: OperatorCategoryCode,
    grant: OperatorGrant,
    notes: string
  ): Promise<void> {
    const res = await fetch(`/api/ehs-approved-drivers/${operatorId}/authorizations`, {
      method: "POST",
      headers: await jsonHeadersWithBearer(),
      body: JSON.stringify({ categoryCode, grant, notes }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      alert(err.error || "Could not save authorization — please try again.");
      return;
    }
    await onChanged();
  }

  return (
    <div
      className="rounded-lg border border-zinc-200 bg-white"
      data-tutorial={tutorialFirst ? "tutorial-ehs-authorizations" : undefined}
    >
      <div className="px-3 py-2 border-b border-zinc-100 text-xs font-semibold uppercase tracking-wide text-zinc-600">
        Authorizations (D018)
      </div>
      <div className="p-3 space-y-4">
        {CATEGORY_GROUP_ORDER.map((group) => (
          <div key={group} className="space-y-2">
            <div className="text-xs font-medium text-zinc-500">{t(`ehsOperator.groups.${group}`)}</div>
            <div className="grid gap-2">
              {categoriesInGroup(group).map((meta) => {
                const auth = authorizations.find((a) => a.category_code === meta.code);
                return (
                  <AuthorizationRowView
                    key={meta.code}
                    meta={meta}
                    auth={auth}
                    userName={userName}
                    userId={userId}
                    onChange={(grant, notes) => updateAuthorization(meta.code, grant, notes)}
                    onChanged={onChanged}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuthorizationRowView({
  meta,
  auth,
  userName,
  userId,
  onChange,
  onChanged,
}: {
  meta: OperatorCategoryMeta;
  auth: AuthorizationRow | undefined;
  userName: string;
  userId: string;
  onChange: (grant: OperatorGrant, notes: string) => void | Promise<void>;
  onChanged: () => void | Promise<void>;
}): React.ReactElement {
  const { t } = useLocaleContext();
  const [grant, setGrant] = useState<OperatorGrant>(auth?.grant ?? "none");
  const [notes, setNotes] = useState<string>(auth?.notes ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setGrant(auth?.grant ?? "none");
    setNotes(auth?.notes ?? "");
  }, [auth]);

  const dirty = grant !== (auth?.grant ?? "none") || notes !== (auth?.notes ?? "");

  async function commit(): Promise<void> {
    setBusy(true);
    try {
      await onChange(grant, notes);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-zinc-100 p-2 bg-zinc-50/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-800">{t(`ehsOperator.categories.${meta.code}.label`)}</div>
          <div className="text-[11px] text-zinc-500">{t(`ehsOperator.categories.${meta.code}.description`)}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {auth?.ready && (
            <Badge variant="success" className="text-[10px]">
              Ready
            </Badge>
          )}
          <select
            value={grant}
            onChange={(e) => setGrant(e.target.value as OperatorGrant)}
            className="h-9 rounded-lg border border-zinc-200 px-2 text-sm bg-white"
          >
            <option value="none">{t("ehsOperator.grants.none")}</option>
            <option value="approved">{t("ehsOperator.grants.approved")}</option>
            <option value="trainer">{t("ehsOperator.grants.trainer")}</option>
          </select>
        </div>
      </div>
      {grant !== "none" && (
        <div className="mt-2 space-y-2">
          <Input
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. 'Automatic vehicles only' or 'Re-train before renewal'"
          />
          {meta.trainingRecordRequired && auth?.id && (
            <div className="rounded-md border border-zinc-200 bg-white p-2 space-y-1">
              <div className="text-xs font-medium text-zinc-600">
                Training record {auth.training_media_count > 0 ? `(${auth.training_media_count} file(s) on file)` : "— upload proof"}
              </div>
              <MediaUpload
                entityType={EHS_OPERATOR_AUTH_MEDIA_ENTITY}
                entityId={auth.id}
                uploadedByName={userName}
                uploadedById={userId}
                defaultCategory="document"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-xs text-blue-700 px-0"
                onClick={() => void onChanged()}
              >
                Refresh count
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <Button type="button" size="sm" variant="outline" disabled={!dirty || busy} onClick={() => void commit()}>
          {busy ? "Saving…" : "Save authorization"}
        </Button>
      </div>
    </div>
  );
}

function AuthorizationsSummary({
  authorizations,
}: {
  authorizations: AuthorizationRow[];
}): React.ReactElement {
  const { t } = useLocaleContext();
  const granted = authorizations.filter((a) => a.grant !== "none");
  if (granted.length === 0) {
    return (
      <div className="text-sm text-zinc-500">No equipment categories authorised yet.</div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Authorisations</div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {granted.map((a) => {
          const meta = getOperatorCategory(a.category_code);
          const label = meta ? t(`ehsOperator.categories.${meta.code}.label`) : a.category_code;
          return (
            <li key={a.id} className="text-sm text-zinc-700 flex items-center gap-2">
              <Badge variant={a.grant === "trainer" ? "info" : "success"} className="text-[10px]">
                {t(`ehsOperator.grants.${a.grant}`)}
              </Badge>
              <span className="truncate">{label}</span>
              {a.ready ? (
                <Badge variant="secondary" className="text-[10px]">Ready</Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Fallback "type it in by hand" card. Always available to edit-capable users so EHS isn't
 * blocked when the HR directory integration (HR_API_BASE_URL / HR_API_KEY) is offline or
 * the person isn't in the HR Portal yet.
 */
function ManualAddOperatorCard({
  organizationId,
  existingEmails,
  onAdded,
}: {
  organizationId: string;
  existingEmails: Set<string>;
  onAdded: () => Promise<void>;
}): React.ReactElement {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [hrEmployeeId, setHrEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    const nm = displayName.trim();
    const em = email.trim();
    if (!nm || !em) {
      setError("Name and email are both required.");
      return;
    }
    if (existingEmails.has(em.toLowerCase())) {
      setError("An operator with this email is already on the register.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/ehs-approved-drivers", {
        method: "POST",
        headers: await jsonHeadersWithBearer(),
        body: JSON.stringify({
          organizationId,
          email: em,
          displayName: nm,
          hrEmployeeId: hrEmployeeId.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not add operator.");
        return;
      }
      setDisplayName("");
      setEmail("");
      setHrEmployeeId("");
      await onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add operator manually</CardTitle>
        <p className="text-sm text-zinc-500 font-normal">
          Use this form if the HR directory is unavailable, or if the person has not yet
          been added to the HR Portal. Every manual add is still recorded in the mutation
          log (visible per record) with the EHS user who added them.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="grid gap-3 sm:grid-cols-3 items-end">
          <Input
            label="Display name *"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Retšelisitsoe Thene"
            required
          />
          <Input
            label="Email *"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@1pwr.com"
            required
          />
          <Input
            label="HR employee ID (optional)"
            value={hrEmployeeId}
            onChange={(e) => setHrEmployeeId(e.target.value)}
            placeholder="e.g. 1PWR130"
          />
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add to register"}
            </Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-xs text-zinc-500">
              The 16-category authorisation grid is seeded with “none” grants; fill in the
              assessments, licence, and relevant grants afterwards, then tick the
              attestation checkbox to sign off.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
