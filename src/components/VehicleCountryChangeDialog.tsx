"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { auth } from "@/lib/firebase";
import { MECHANICAL_INSPECTION_TYPES_FOR_TRANSFER } from "@/lib/vehicle-country-change";

interface OrgRow {
  id: string;
  name: string;
  code: string;
  country: string;
}

interface TripRow {
  id: string;
  destination: string;
  mission_type: string;
  checkout_at: string;
  organization_id: string;
}

interface InspRow {
  id: string;
  type: string;
  overall_pass: number;
  created_at: string;
}

export function VehicleCountryChangeDialog({
  open,
  onClose,
  vehicleId,
  vehicleCode,
  fromOrganizationId,
  fromOrganizationName,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
  vehicleCode: string;
  fromOrganizationId: string;
  fromOrganizationName: string;
  onSubmitted: () => void;
}): React.ReactElement | null {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [changeKind, setChangeKind] = useState<"data_correction" | "secondment" | "permanent_transfer">(
    "data_correction"
  );
  const [toOrganizationId, setToOrganizationId] = useState("");
  const [reason, setReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [transferSummary, setTransferSummary] = useState("");
  const [missionTripId, setMissionTripId] = useState("");
  const [mechanicalInspectionId, setMechanicalInspectionId] = useState("");
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [inspections, setInspections] = useState<InspRow[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadOrgs = useCallback(() => {
    fetch("/api/organizations")
      .then((r) => r.json())
      .then((d: OrgRow[]) => setOrgs(Array.isArray(d) ? d : []))
      .catch(() => setOrgs([]));
  }, []);

  const loadTransferRefs = useCallback(() => {
    fetch(`/api/trips?vehicleId=${encodeURIComponent(vehicleId)}&allOrgs=true`)
      .then((r) => r.json())
      .then((d: TripRow[]) => setTrips(Array.isArray(d) ? d : []))
      .catch(() => setTrips([]));
    fetch(`/api/inspections?org=${encodeURIComponent(fromOrganizationId)}&vehicleId=${encodeURIComponent(vehicleId)}`)
      .then((r) => r.json())
      .then((raw: InspRow[]) => {
        const list = Array.isArray(raw) ? raw : [];
        setInspections(
          list.filter(
            (i) =>
              i.overall_pass === 1 &&
              MECHANICAL_INSPECTION_TYPES_FOR_TRANSFER.has(i.type)
          )
        );
      })
      .catch(() => setInspections([]));
  }, [vehicleId, fromOrganizationId]);

  useEffect(() => {
    if (!open) return;
    setError("");
    loadOrgs();
    setToOrganizationId("");
    setReason("");
    setEffectiveDate("");
    setExpectedReturnDate("");
    setTransferSummary("");
    setMissionTripId("");
    setMechanicalInspectionId("");
    setChangeKind("data_correction");
  }, [open, loadOrgs]);

  useEffect(() => {
    if (!open) return;
    if (changeKind === "secondment" || changeKind === "permanent_transfer") {
      loadTransferRefs();
    }
  }, [open, changeKind, loadTransferRefs]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    if (!toOrganizationId || toOrganizationId === fromOrganizationId) {
      setError("Select a different country / organization.");
      return;
    }
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      setError("You must be signed in to submit a country change.");
      return;
    }

    const body: Record<string, unknown> = {
      changeKind,
      toOrganizationId,
      reason: reason.trim(),
    };
    if (changeKind === "secondment" || changeKind === "permanent_transfer") {
      body.effectiveDate = effectiveDate;
      body.expectedReturnDate = changeKind === "secondment" ? expectedReturnDate : "";
      body.transferSummary = transferSummary.trim();
      body.missionTripId = missionTripId;
      body.mechanicalInspectionId = mechanicalInspectionId;
    }

    setSubmitting(true);
    const res = await fetch(`/api/vehicles/${vehicleId}/country-change-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "Request failed");
      return;
    }
    onSubmitted();
    onClose();
  }

  const targetChoices = orgs.filter((o) => o.id !== fromOrganizationId);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>Change vehicle country</CardTitle>
          <p className="text-sm text-zinc-500 font-normal">
            {vehicleCode} · Current: <strong>{fromOrganizationName}</strong>
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-zinc-700">Type of change</label>
              <div className="mt-2 space-y-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="kind"
                    checked={changeKind === "data_correction"}
                    onChange={() => setChangeKind("data_correction")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Data correction</span>
                    <span className="block text-zinc-500">
                      The vehicle was created under the wrong country by mistake. Fleet lead / manager approval only.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="kind"
                    checked={changeKind === "secondment"}
                    onChange={() => setChangeKind("secondment")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Secondment (temporary)</span>
                    <span className="block text-zinc-500">
                      Real transfer: mission, passed mechanical inspection, and C-level sign-off required.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="kind"
                    checked={changeKind === "permanent_transfer"}
                    onChange={() => setChangeKind("permanent_transfer")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">Permanent transfer</span>
                    <span className="block text-zinc-500">
                      Same requirements as secondment; ownership moves to the destination country.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <Select
              label="Move to organization / country *"
              name="toOrg"
              value={toOrganizationId}
              onChange={(e) => setToOrganizationId(e.target.value)}
              required
            >
              <option value="">Select…</option>
              {targetChoices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.country})
                </option>
              ))}
            </Select>

            <div>
              <label className="text-sm font-medium text-zinc-700" htmlFor="vcc-reason">
                Explain this change *
              </label>
              <textarea
                id="vcc-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
                className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                placeholder="Why is the country / organization changing?"
              />
            </div>

            {(changeKind === "secondment" || changeKind === "permanent_transfer") && (
              <>
                <Input
                  label="Effective date *"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  required
                />
                {changeKind === "secondment" && (
                  <Input
                    label="Expected return date *"
                    type="date"
                    value={expectedReturnDate}
                    onChange={(e) => setExpectedReturnDate(e.target.value)}
                    required
                  />
                )}
                <div>
                  <label className="text-sm font-medium text-zinc-700" htmlFor="vcc-summary">
                    Transfer details *
                  </label>
                  <textarea
                    id="vcc-summary"
                    value={transferSummary}
                    onChange={(e) => setTransferSummary(e.target.value)}
                    rows={2}
                    required
                    className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder="Route, handover contact, shipping notes, etc."
                  />
                </div>

                <Select
                  label="Linked mission (trip) *"
                  name="mission"
                  value={missionTripId}
                  onChange={(e) => setMissionTripId(e.target.value)}
                  required
                >
                  <option value="">Select a trip…</option>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {new Date(t.checkout_at).toLocaleString()} · {t.mission_type} → {t.destination}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Completed mechanical inspection *"
                  name="insp"
                  value={mechanicalInspectionId}
                  onChange={(e) => setMechanicalInspectionId(e.target.value)}
                  required
                >
                  <option value="">Select inspection…</option>
                  {inspections.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.type.replace(/-/g, " ")} · {new Date(i.created_at).toLocaleString()}
                    </option>
                  ))}
                </Select>
                {inspections.length === 0 && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    No qualifying inspections yet. Complete a <strong>Detailed mechanical</strong> or{" "}
                    <strong>Mechanical (cross-border transfer)</strong> checklist with an overall pass on the Inspections
                    page.
                  </p>
                )}
              </>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {error}
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit request"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
