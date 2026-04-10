"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { FIELD_ISSUE_CLOSEOUT_OUTCOME, ISSUE_SEVERITY } from "@/types";

interface VehicleOption { id: string; code: string; make: string; model: string; }

interface FieldReport {
  id: string;
  ticket_uid: string;
  vehicle_code: string;
  vehicle_make: string;
  vehicle_model: string;
  title: string;
  description: string;
  severity: string;
  location: string;
  odometer: number | null;
  is_driveable: number;
  photo_count: number;
  status: string;
  work_order_id: string | null;
  reported_by_name: string;
  created_at: string;
  closed_at: string | null;
  closed_by_name: string | null;
  attended_by_name: string | null;
  closeout_outcome: string | null;
  closeout_notes: string | null;
  photos: Array<{ id: string; file_name: string; entity_type: string; entity_id: string; original_name: string; mime_type: string }>;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-600",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  converted: "bg-green-100 text-green-700",
  closed: "bg-emerald-100 text-emerald-800",
  dismissed: "bg-zinc-100 text-zinc-500",
};

const OUTCOME_LABELS: Record<string, string> = {
  [FIELD_ISSUE_CLOSEOUT_OUTCOME.RESOLVED_NO_WO]: "Resolved (no work order)",
  [FIELD_ISSUE_CLOSEOUT_OUTCOME.RESOLVED_VIA_WO]: "Resolved via work order",
  [FIELD_ISSUE_CLOSEOUT_OUTCOME.DEFERRED]: "Deferred",
  [FIELD_ISSUE_CLOSEOUT_OUTCOME.DUPLICATE]: "Duplicate",
  [FIELD_ISSUE_CLOSEOUT_OUTCOME.NOT_REPRODUCIBLE]: "Not reproducible",
  [FIELD_ISSUE_CLOSEOUT_OUTCOME.OTHER]: "Other",
};

function TicketCloseForm({
  report,
  userLabel,
  busy,
  onSubmit,
}: {
  report: FieldReport;
  userLabel: string;
  busy: boolean;
  onSubmit: (p: {
    status: "closed" | "dismissed";
    closeoutOutcome: string;
    attendedByName: string;
    closeoutNotes: string;
    workOrderId?: string;
  }) => Promise<void>;
}): React.ReactElement {
  const [outcome, setOutcome] = useState<string>(FIELD_ISSUE_CLOSEOUT_OUTCOME.RESOLVED_NO_WO);
  const [attendedByName, setAttendedByName] = useState(userLabel);
  const [closeoutNotes, setCloseoutNotes] = useState("");
  const [terminal, setTerminal] = useState<"closed" | "dismissed">("closed");
  const [workOrderId, setWorkOrderId] = useState(report.work_order_id || "");

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const needWo = outcome === FIELD_ISSUE_CLOSEOUT_OUTCOME.RESOLVED_VIA_WO;
    const effectiveWo = (report.work_order_id || workOrderId.trim()) || undefined;
    if (needWo && !effectiveWo) {
      window.alert("Link or create a work order first, or enter the work order ID for this outcome.");
      return;
    }
    await onSubmit({
      status: terminal,
      closeoutOutcome: outcome,
      attendedByName: attendedByName.trim(),
      closeoutNotes,
      workOrderId: effectiveWo,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 space-y-2 text-left">
      <div className="text-xs font-semibold text-zinc-700">Close ticket</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-zinc-600">
          Resolution
          <select
            value={terminal}
            onChange={(e) => setTerminal(e.target.value as "closed" | "dismissed")}
            className="mt-0.5 flex w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="closed">Closed — addressed</option>
            <option value="dismissed">Dismissed — not actioned</option>
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          Outcome
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="mt-0.5 flex w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm"
          >
            {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-xs text-zinc-600 block">
        Who attended / performed the closeout?
        <input
          value={attendedByName}
          onChange={(e) => setAttendedByName(e.target.value)}
          required
          className="mt-0.5 flex w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm"
          placeholder="Name"
        />
      </label>
      {outcome === FIELD_ISSUE_CLOSEOUT_OUTCOME.RESOLVED_VIA_WO && !report.work_order_id && (
        <label className="text-xs text-zinc-600 block">
          Work order ID
          <input
            value={workOrderId}
            onChange={(e) => setWorkOrderId(e.target.value)}
            className="mt-0.5 flex w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm font-mono"
            placeholder="Paste UUID from work order"
          />
        </label>
      )}
      <label className="text-xs text-zinc-600 block">
        Notes
        <textarea
          value={closeoutNotes}
          onChange={(e) => setCloseoutNotes(e.target.value)}
          rows={2}
          className="mt-0.5 flex w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm"
          placeholder="Optional — parts used, follow-up, etc."
        />
      </label>
      <Button type="submit" size="sm" variant="secondary" disabled={busy} className="w-full sm:w-auto">
        {busy ? "Saving..." : "Submit closeout"}
      </Button>
    </form>
  );
}

export default function ReportIssuePage(): React.ReactElement {
  const { user, organizationId } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isConverting, setIsConverting] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [lastTicketUid, setLastTicketUid] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/vehicles?org=${organizationId}`)
      .then((r) => r.json())
      .then(setVehicles)
      .catch(() => {});
    loadReports();
  }, [organizationId]);

  function loadReports(): void {
    fetch(`/api/field-reports?org=${organizationId}`)
      .then((r) => r.json())
      .then(setReports)
      .catch(() => {});
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = e.target.files;
    if (!files) return;
    const urls: string[] = [];
    for (const f of Array.from(files)) {
      if (f.type.startsWith("image/")) urls.push(URL.createObjectURL(f));
    }
    setPreviewUrls(urls);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);

    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("reportedById", user?.id || "");
    fd.set("reportedByName", user?.name || user?.email || "");

    const photos = fileRef.current?.files;
    if (photos) {
      for (const f of Array.from(photos)) {
        fd.append("photos", f);
      }
    }

    const res = await fetch("/api/field-reports", { method: "POST", body: fd });
    if (res.ok) {
      const data = (await res.json()) as { ticket_uid?: string };
      setLastTicketUid(data.ticket_uid || null);
      setSubmitted(true);
      setPreviewUrls([]);
      form.reset();
      loadReports();
      setTimeout(() => setSubmitted(false), 6000);
    }
    setIsSubmitting(false);
  }

  async function handleConvert(reportId: string): Promise<void> {
    setIsConverting(reportId);
    const res = await fetch(`/api/field-reports/${reportId}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) loadReports();
    setIsConverting(null);
  }

  async function handleCloseTicket(
    report: FieldReport,
    payload: {
      status: "closed" | "dismissed";
      closeoutOutcome: string;
      attendedByName: string;
      closeoutNotes: string;
      workOrderId?: string;
    }
  ): Promise<void> {
    setClosingId(report.id);
    const res = await fetch(`/api/field-reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: payload.status,
        closeoutOutcome: payload.closeoutOutcome,
        attendedByName: payload.attendedByName,
        closedByName: user?.name || user?.email || "Fleet user",
        closedById: user?.id || "",
        closeoutNotes: payload.closeoutNotes,
        ...(payload.workOrderId ? { workOrderId: payload.workOrderId } : {}),
      }),
    });
    if (res.ok) loadReports();
    setClosingId(null);
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold">Report Vehicle Issue</h2>
        <p className="text-sm text-zinc-500 mt-1">Use this form to report a vehicle problem from the field. Include photos if possible.</p>
      </div>

      {submitted && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-green-800 text-sm font-medium space-y-1">
          <div>Issue reported successfully! The fleet team will review it shortly.</div>
          {lastTicketUid && (
            <div className="font-mono text-xs text-green-900">
              Ticket ID: <span className="font-semibold">{lastTicketUid}</span>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New Issue Report</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select name="vehicleId" label="Vehicle *" required>
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.code} — {v.make} {v.model}</option>
              ))}
            </Select>

            <Input name="title" label="What's the problem? *" required placeholder="e.g. Brake warning light on, flat tire, engine noise" />

            <div>
              <label className="text-sm font-medium text-zinc-700">Details</label>
              <textarea
                name="description"
                rows={3}
                className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                placeholder="Describe the issue in detail — when did it start, what were you doing, any sounds/smells?"
              />
            </div>

            <div className="grid gap-4 grid-cols-2">
              <Select name="severity" label="How serious? *" required>
                {Object.values(ISSUE_SEVERITY).map((s) => (
                  <option key={s} value={s}>{s === "critical" ? "CRITICAL — Can't drive" : s === "high" ? "High — Needs urgent fix" : s === "medium" ? "Medium — Can still drive" : "Low — Minor issue"}</option>
                ))}
              </Select>

              <Select name="isDriveable" label="Can you still drive?">
                <option value="true">Yes, still driveable</option>
                <option value="false">No, vehicle is stuck</option>
              </Select>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <Input name="location" label="Your current location" placeholder="e.g. MAK site, on road to SEB" />
              <Input name="odometer" label="Odometer reading" type="number" placeholder="km" />
            </div>

            {/* Photo capture — optimized for mobile */}
            <div>
              <label className="text-sm font-medium text-zinc-700">Photos (strongly recommended)</label>
              <p className="text-xs text-zinc-400 mb-2">Take photos of the issue — dashboard warning lights, damage, leaks, etc.</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Take / Choose Photos
                </Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
              {previewUrls.length > 0 && (
                <div className="flex gap-2 mt-2 overflow-x-auto">
                  {previewUrls.map((url, i) => (
                    <img key={i} src={url} alt={`Preview ${i + 1}`} className="w-20 h-20 rounded-lg object-cover border border-zinc-200" />
                  ))}
                </div>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full h-12 text-base">
              {isSubmitting ? "Submitting..." : "Submit Issue Report"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Recent reports */}
      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {reports.map((r) => {
                const canClose =
                  !r.closed_at && r.status !== "closed" && r.status !== "dismissed";
                const isTerminal = Boolean(r.closed_at) || r.status === "closed" || r.status === "dismissed";
                return (
                <div key={r.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs text-zinc-500 mb-0.5">
                        {r.ticket_uid || `— ${r.id.slice(0, 8)}`}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{r.vehicle_code}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[r.severity] || ""}`}>{r.severity}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] || "bg-zinc-100 text-zinc-600"}`}>{r.status}</span>
                      </div>
                      <p className="text-sm font-medium mt-0.5">{r.title}</p>
                      {r.description && <p className="text-xs text-zinc-500 mt-0.5">{r.description}</p>}
                    </div>
                    <div className="text-right text-xs text-zinc-400 whitespace-nowrap">
                      <div>{new Date(r.created_at).toLocaleDateString()}</div>
                      <div>{r.reported_by_name}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    {r.location && <span>📍 {r.location}</span>}
                    {!r.is_driveable && <span className="text-red-600 font-medium">NOT DRIVEABLE</span>}
                    {r.photo_count > 0 && <span>📷 {r.photo_count} photo(s)</span>}
                  </div>

                  {/* Photo thumbnails */}
                  {r.photos && r.photos.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto">
                      {r.photos.filter((p) => p.mime_type.startsWith("image/")).map((p) => (
                        <img
                          key={p.id}
                          src={`/uploads/${p.entity_type}/${p.entity_id}/${p.file_name}`}
                          alt=""
                          className="w-16 h-16 rounded object-cover border border-zinc-200"
                        />
                      ))}
                    </div>
                  )}

                  {isTerminal && (r.closeout_outcome || r.closed_at) && (
                    <div className="rounded-md bg-emerald-50/80 border border-emerald-100 px-2 py-2 text-xs text-emerald-900 space-y-1">
                      <div className="font-medium">Closeout</div>
                      {r.closed_at && (
                        <div>
                          Closed {new Date(r.closed_at).toLocaleString()}
                          {r.closed_by_name ? ` · by ${r.closed_by_name}` : ""}
                        </div>
                      )}
                      {r.attended_by_name && <div>Attended by: {r.attended_by_name}</div>}
                      {r.closeout_outcome && (
                        <div>Outcome: {OUTCOME_LABELS[r.closeout_outcome] || r.closeout_outcome}</div>
                      )}
                      {r.closeout_notes && <div className="text-emerald-800 whitespace-pre-wrap">{r.closeout_notes}</div>}
                    </div>
                  )}

                  {r.status === "open" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleConvert(r.id)}
                        disabled={isConverting === r.id}
                      >
                        {isConverting === r.id ? "Creating..." : "Create Work Order"}
                      </Button>
                    </div>
                  )}

                  {r.work_order_id && (
                    <div className="text-xs text-green-600 font-mono">
                      Work order: {r.work_order_id}
                    </div>
                  )}

                  {canClose && (
                    <TicketCloseForm
                      report={r}
                      userLabel={user?.name || user?.email || ""}
                      busy={closingId === r.id}
                      onSubmit={(p) => handleCloseTicket(r, p)}
                    />
                  )}
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
