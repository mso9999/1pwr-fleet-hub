"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MediaUpload } from "@/components/MediaUpload";
import { useAuth } from "@/lib/auth-context";
import { MEDIA_CATEGORY } from "@/types";
import { PVR_VEHICLE_AVAILABILITY_OVERRIDE_MIN_CHARS } from "@/lib/pvr-approval-rules";

interface PvrRates {
  fullPerKmLsl: number;
  halfPerKmLsl: number;
  hqBasisKm: number;
  hqFlatFullLsl: number;
  hqFlatHalfLsl: number;
}

interface EligibilityPayload {
  eligible: boolean;
  requiresApprovedMission?: boolean;
  requiresVehicleAvailabilityOverrideNotes?: boolean;
  operationalVehicleCount: number;
  message: string;
  rates?: PvrRates;
}

interface MissionOption {
  id: string;
  title: string;
  destination: string;
  departure_date: string;
  return_date: string;
  lifecycle_status: string;
  approval_status: string;
}

interface ClaimRow {
  id: string;
  mission_id?: string | null;
  trip_date: string;
  requested_by_name: string;
  destination: string;
  trip_reason: string;
  personal_vehicle_justification: string;
  rate_band: string;
  fee_type: string;
  total_km: number | null;
  reimbursement_lsl: number;
  currency: string;
  status: string;
  approved_by_name: string;
  rejection_reason: string;
  finance_reference: string;
  pool_operational_count_snapshot?: number | null;
  notes?: string;
  created_at: string;
}

const STATUS_STYLE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  paid: "outline",
};

export default function PersonalVehicleReimbursementPage(): React.ReactElement {
  const { organizationId, user } = useAuth();
  const [draftClaimId, setDraftClaimId] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pvr-${Date.now()}`
  );

  const [eligibility, setEligibility] = useState<EligibilityPayload | null>(null);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [missionOptions, setMissionOptions] = useState<MissionOption[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const [tripDate, setTripDate] = useState("");
  const [destination, setDestination] = useState("");
  const [tripReason, setTripReason] = useState("");
  const [justification, setJustification] = useState("");
  const [rateBand, setRateBand] = useState<"full" | "half">("full");
  const [feeType, setFeeType] = useState<"hq_round_trip" | "per_km">("per_km");
  const [totalKm, setTotalKm] = useState("");
  const [notes, setNotes] = useState("");

  const canApproveClaims =
    user &&
    (user.role === "fleet_lead" ||
      user.role === "manager" ||
      user.role === "admin" ||
      user.role === "finance" ||
      user.role === "superadmin");

  const loadData = useCallback(() => {
    setLoadError(null);
    Promise.all([
      fetch(`/api/personal-vehicle-reimbursements/eligibility?org=${organizationId}`).then((r) =>
        r.json()
      ),
      fetch(`/api/personal-vehicle-reimbursements?org=${organizationId}`).then((r) => r.json()),
    ])
      .then(([el, list]) => {
        setEligibility(el as EligibilityPayload);
        setClaims(Array.isArray(list) ? list : []);
        if (el && typeof el === "object" && "error" in el) {
          setLoadError(String((el as { error: string }).error));
        }
      })
      .catch(() => {
        setLoadError("Network error");
        setClaims([]);
      });
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!organizationId || !showForm || !eligibility) {
      return;
    }
    let cancelled = false;
    fetch(
      `/api/missions?org=${encodeURIComponent(organizationId)}&status=all&approvalStatus=approved`
    )
      .then((r) => r.json())
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? (rows as MissionOption[]) : [];
        setMissionOptions(
          list.filter(
            (m) => String(m.lifecycle_status || "active").toLowerCase() === "active"
          )
        );
      })
      .catch(() => {
        if (!cancelled) setMissionOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, showForm, eligibility]);

  const rates = eligibility?.rates;

  const estimatedLsl = useMemo(() => {
    if (!rates) return null;
    if (feeType === "hq_round_trip") {
      return rateBand === "full" ? rates.hqFlatFullLsl : rates.hqFlatHalfLsl;
    }
    const km = parseFloat(totalKm);
    if (!Number.isFinite(km)) return null;
    const per = rateBand === "full" ? rates.fullPerKmLsl : rates.halfPerKmLsl;
    return Math.round(km * per * 100) / 100;
  }, [rates, feeType, rateBand, totalKm]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setFormError("");
    if (eligibility?.requiresVehicleAvailabilityOverrideNotes) {
      if (notes.trim().length < PVR_VEHICLE_AVAILABILITY_OVERRIDE_MIN_CHARS) {
        setFormError(
          `Operational fleet vehicles are available — Notes must document the override (at least ${PVR_VEHICLE_AVAILABILITY_OVERRIDE_MIN_CHARS} characters).`
        );
        return;
      }
    }
    if (!tripDate.trim() || !destination.trim() || !tripReason.trim()) {
      setFormError("Trip date, destination, and reason are required.");
      return;
    }
    if (!selectedMissionId.trim()) {
      setFormError("Select the pre-approved mission this trip belongs to.");
      return;
    }
    if (!justification.trim()) {
      setFormError("Provide a short explanation for using your personal vehicle.");
      return;
    }
    if (rateBand === "full" && feeType === "per_km" && justification.trim().length < 20) {
      setFormError(
        "Full-rate per-km claims require a detailed explanation (at least 20 characters), per F006."
      );
      return;
    }

    setIsSubmitting(true);
    const res = await fetch("/api/personal-vehicle-reimbursements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draftClaimId,
        organizationId,
        tripDate: tripDate.trim(),
        destination: destination.trim(),
        tripReason: tripReason.trim(),
        personalVehicleJustification: justification.trim(),
        rateBand,
        feeType,
        totalKm: feeType === "per_km" ? totalKm : undefined,
        requestedById: user?.id || "",
        requestedByName: user?.name || "",
        notes: notes.trim(),
        missionId: selectedMissionId.trim(),
      }),
    });
    setIsSubmitting(false);
    if (res.ok) {
      setShowForm(false);
      setTripDate("");
      setDestination("");
      setTripReason("");
      setJustification("");
      setNotes("");
      setTotalKm("");
      setSelectedMissionId("");
      setDraftClaimId(crypto.randomUUID());
      loadData();
    } else {
      const err = await res.json().catch(() => ({}));
      setFormError(err.error || "Submit failed.");
    }
  }

  async function patchClaim(
    id: string,
    body: Record<string, string | undefined>
  ): Promise<boolean> {
    const res = await fetch(`/api/personal-vehicle-reimbursements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      window.alert(typeof err.error === "string" ? err.error : "Update failed.");
      return false;
    }
    loadData();
    return true;
  }

  return (
    <div className="space-y-6 max-w-3xl" data-tutorial="tutorial-pvr-page">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Personal vehicle reimbursement</h2>
        <p className="text-sm text-zinc-500 mt-1">
          F006-style claim tied to an approved Fleet Hub mission. If operational 1PWR vehicles exist at
          submit time, Notes must record a formal override or the claim cannot be approved. Insurance
          proof, mileage evidence, and manager or finance sign-off apply. Approved rows export from
          Reports.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      )}

      {eligibility && (
        <Card
          className={
            eligibility.operationalVehicleCount === 0 ? "border-emerald-200" : "border-amber-200"
          }
          data-tutorial="tutorial-pvr-eligibility"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Eligibility</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>{eligibility.message}</p>
            {rates && (
              <p className="text-zinc-600">
                Policy rates (LSL): full {rates.fullPerKmLsl.toFixed(2)}/km · half{" "}
                {rates.halfPerKmLsl.toFixed(2)}/km · HQ round-trip flat = per-km × {rates.hqBasisKm} km
                (full {rates.hqFlatFullLsl.toFixed(2)}, half {rates.hqFlatHalfLsl.toFixed(2)}).
                Per-km applies to trips over 20 km only.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          size="lg"
          className="touch-manipulation min-h-[48px]"
          disabled={!eligibility}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Close form" : "+ New claim"}
        </Button>
      </div>

      {showForm && eligibility && (
        <form onSubmit={handleSubmit} className="space-y-6" data-tutorial="tutorial-pvr-form">
          <Card className="border-blue-200" data-tutorial="tutorial-pvr-attachments">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">1. Attachments (before submit)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-zinc-600">
                Upload proof of personal vehicle insurance and odometer/map evidence. Files are stored
                under claim id <code className="text-xs bg-zinc-100 px-1 rounded">{draftClaimId}</code>.
              </p>
              <div>
                <h4 className="text-sm font-medium mb-2">Insurance</h4>
                <MediaUpload
                  entityType="pvr_claim"
                  entityId={draftClaimId}
                  uploadedById={user?.id || ""}
                  uploadedByName={user?.name || ""}
                  defaultCategory={MEDIA_CATEGORY.INSURANCE}
                />
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Mileage evidence</h4>
                <p className="text-xs text-zinc-500 mb-2">
                  Odometer start/end photos or map with route and total km.
                </p>
                <MediaUpload
                  entityType="pvr_claim"
                  entityId={draftClaimId}
                  uploadedById={user?.id || ""}
                  uploadedByName={user?.name || ""}
                  defaultCategory={MEDIA_CATEGORY.MILEAGE_EVIDENCE}
                />
              </div>
            </CardContent>
          </Card>

          <Card data-tutorial="tutorial-pvr-trip-details">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">2. Trip details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Pre-approved mission (required)</label>
                <select
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  value={selectedMissionId}
                  onChange={(e) => setSelectedMissionId(e.target.value)}
                  required
                >
                  <option value="">Select mission…</option>
                  {missionOptions.map((m) => {
                    const dep = String(m.departure_date || "").slice(0, 10);
                    const ret = String(m.return_date || m.departure_date || "").slice(0, 10);
                    return (
                      <option key={m.id} value={m.id}>
                        {(m.title || m.destination || "Mission").trim()} · {dep} → {ret}
                      </option>
                    );
                  })}
                </select>
                {missionOptions.length === 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    No approved active missions found for this organisation. Create and get a mission
                    approved in Fleet reservations before submitting a personal-vehicle claim.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Trip date</label>
                <Input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} required />
                <p className="text-xs text-zinc-500 mt-1">
                  Must fall within the mission departure and return dates you selected above.
                </p>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Destination(s)</label>
                <Input value={destination} onChange={(e) => setDestination(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Reason for trip</label>
                <Input value={tripReason} onChange={(e) => setTripReason(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">
                  Why personal vehicle / why no 1PWR vehicle (required; 20+ chars for full-rate per-km)
                </label>
                <textarea
                  className="w-full min-h-[88px] rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  required
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Rate</label>
                  <select
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                    value={rateBand}
                    onChange={(e) => setRateBand(e.target.value as "full" | "half")}
                  >
                    <option value="full">Full rate</option>
                    <option value="half">50% rate</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Fee type</label>
                  <select
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                    value={feeType}
                    onChange={(e) => setFeeType(e.target.value as "hq_round_trip" | "per_km")}
                  >
                    <option value="per_km">Per km (&gt; 20 km)</option>
                    <option value="hq_round_trip">HQ town round trip (flat)</option>
                  </select>
                </div>
              </div>

              {feeType === "per_km" && (
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Total km</label>
                  <Input
                    type="number"
                    min={21}
                    step={0.1}
                    value={totalKm}
                    onChange={(e) => setTotalKm(e.target.value)}
                    required
                  />
                </div>
              )}

              {estimatedLsl != null && (
                <p className="text-sm text-emerald-800 font-medium">
                  Estimated reimbursement: {estimatedLsl.toFixed(2)} LSL (final amount set on submit)
                </p>
              )}

              <div>
                <label className="text-xs text-zinc-500 block mb-1">
                  Notes
                  {eligibility.requiresVehicleAvailabilityOverrideNotes
                    ? ` (required — fleet override, min ${PVR_VEHICLE_AVAILABILITY_OVERRIDE_MIN_CHARS} characters)`
                    : " (optional — e.g. tolls; include override detail here if policy requires)"}
                </label>
                <textarea
                  className="w-full min-h-[100px] rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required={!!eligibility.requiresVehicleAvailabilityOverrideNotes}
                  minLength={
                    eligibility.requiresVehicleAvailabilityOverrideNotes
                      ? PVR_VEHICLE_AVAILABILITY_OVERRIDE_MIN_CHARS
                      : undefined
                  }
                />
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <Button type="submit" disabled={isSubmitting} className="min-h-[48px]">
                {isSubmitting ? "Submitting…" : "Submit claim"}
              </Button>
            </CardContent>
          </Card>
        </form>
      )}

      <Card data-tutorial="tutorial-pvr-claims">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Claims</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {claims.length === 0 ? (
            <p className="text-sm text-zinc-500">No claims yet.</p>
          ) : (
            claims.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-zinc-200 p-4 space-y-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-zinc-900">
                    {c.trip_date} · {c.destination}
                  </span>
                  <Badge variant={STATUS_STYLE[c.status] || "secondary"}>{c.status}</Badge>
                </div>
                <p className="text-zinc-600">{c.trip_reason}</p>
                <p className="text-zinc-500 text-xs">
                  {c.rate_band} / {c.fee_type}
                  {c.total_km != null ? ` · ${c.total_km} km` : ""} · {c.reimbursement_lsl.toFixed(2)}{" "}
                  {c.currency}
                </p>
                <p className="text-xs text-zinc-500">
                  Claim id: {c.id}
                  {c.mission_id ? ` · Mission: ${c.mission_id}` : ""}
                </p>
                {typeof c.pool_operational_count_snapshot === "number" &&
                  c.pool_operational_count_snapshot > 0 && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                      Submitted while {c.pool_operational_count_snapshot} operational fleet vehicle(s) were
                      in the pool — approval requires override documentation in Notes (
                      {PVR_VEHICLE_AVAILABILITY_OVERRIDE_MIN_CHARS}+ characters).
                    </p>
                  )}
                {c.notes && (
                  <p className="text-xs text-zinc-600 whitespace-pre-wrap">
                    <span className="font-medium text-zinc-700">Notes: </span>
                    {c.notes}
                  </p>
                )}
                {c.finance_reference && (
                  <p className="text-xs text-zinc-700">Finance ref: {c.finance_reference}</p>
                )}
                {canApproveClaims && c.status === "submitted" && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        patchClaim(c.id, {
                          status: "approved",
                          approvedByName: user?.name || "",
                          approvedById: user?.id || "",
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const reason = window.prompt("Rejection reason?");
                        if (reason)
                          patchClaim(c.id, {
                            status: "rejected",
                            approvedByName: user?.name || "",
                            rejectionReason: reason,
                          });
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {canApproveClaims && c.status === "approved" && (
                  <div className="flex flex-wrap gap-2 items-center pt-2">
                    <Input
                      className="max-w-xs h-9 text-xs"
                      placeholder="Finance reference / claim #"
                      id={`fin-${c.id}`}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const el = document.getElementById(`fin-${c.id}`) as HTMLInputElement | null;
                        const ref = el?.value?.trim();
                        if (ref)
                          patchClaim(c.id, { financeReference: ref, status: "paid" });
                      }}
                    >
                      Mark paid
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
