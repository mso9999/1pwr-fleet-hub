"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MediaUpload } from "@/components/MediaUpload";
import { useAuth } from "@/lib/auth-context";
import { MEDIA_CATEGORY } from "@/types";

interface PvrRates {
  fullPerKmLsl: number;
  halfPerKmLsl: number;
  hqBasisKm: number;
  hqFlatFullLsl: number;
  hqFlatHalfLsl: number;
}

interface EligibilityPayload {
  eligible: boolean;
  operationalVehicleCount: number;
  message: string;
  rates?: PvrRates;
}

interface ClaimRow {
  id: string;
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

  const [tripDate, setTripDate] = useState("");
  const [destination, setDestination] = useState("");
  const [tripReason, setTripReason] = useState("");
  const [justification, setJustification] = useState("");
  const [rateBand, setRateBand] = useState<"full" | "half">("full");
  const [feeType, setFeeType] = useState<"hq_round_trip" | "per_km">("per_km");
  const [totalKm, setTotalKm] = useState("");
  const [notes, setNotes] = useState("");

  const isManager =
    user && (user.role === "fleet_lead" || user.role === "manager" || user.role === "admin");

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
    if (!eligibility?.eligible) {
      setFormError("You are not eligible to submit while operational fleet vehicles are available.");
      return;
    }
    if (!tripDate.trim() || !destination.trim() || !tripReason.trim()) {
      setFormError("Trip date, destination, and reason are required.");
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
  ): Promise<void> {
    await fetch(`/api/personal-vehicle-reimbursements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    loadData();
  }

  return (
    <div className="space-y-6 max-w-3xl" data-tutorial="tutorial-pvr-page">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Personal vehicle reimbursement</h2>
        <p className="text-sm text-zinc-500 mt-1">
          F006-style claim when no 1PWR vehicle is available for assignment, with insurance proof and
          manager approval. Finance can export approved claims from Reports.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      )}

      {eligibility && (
        <Card
          className={eligibility.eligible ? "border-emerald-200" : "border-amber-200"}
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
          disabled={!eligibility?.eligible}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Close form" : "+ New claim"}
        </Button>
      </div>

      {showForm && eligibility?.eligible && (
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
                <label className="text-xs text-zinc-500 block mb-1">Trip date</label>
                <Input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} required />
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
                <label className="text-xs text-zinc-500 block mb-1">Notes (optional)</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
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
                <p className="text-xs text-zinc-500">Claim id: {c.id}</p>
                {c.finance_reference && (
                  <p className="text-xs text-zinc-700">Finance ref: {c.finance_reference}</p>
                )}
                {isManager && c.status === "submitted" && (
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
                {isManager && c.status === "approved" && (
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
