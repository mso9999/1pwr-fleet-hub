"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";
import { DriverVehicleCheckForm } from "@/components/DriverVehicleCheckForm";
import { useTutorial } from "@/components/tutorial/tutorial-context";
import { MediaUpload } from "@/components/MediaUpload";
import { mediaAttachmentFileUrl } from "@/lib/media-file-url";
import { bearerAuthHeaders } from "@/lib/client-bearer";

interface MediaRow {
  id: string;
  mime_type: string;
  file_name: string;
  category: string;
  caption: string;
}

function dvcPhotoLabel(category: string): string {
  const m: Record<string, string> = {
    "dvc-exterior-front": "Front",
    "dvc-exterior-rear": "Rear",
    "dvc-exterior-left": "Left",
    "dvc-exterior-right": "Right",
    "dvc-odometer": "Odometer",
  };
  return m[category] || category;
}

function DriverCheckVerificationPhotos({
  checkId,
  listVersion = 0,
}: {
  checkId: string;
  /** Increment to refetch after uploads elsewhere (e.g. MediaUpload on same card). */
  listVersion?: number;
}): React.ReactElement {
  const [items, setItems] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const headers = await bearerAuthHeaders();
      try {
        const r = await fetch(
          `/api/media?entityType=driver_vehicle_check&entityId=${encodeURIComponent(checkId)}`,
          { headers }
        );
        const d: unknown = r.ok ? await r.json() : [];
        if (!cancelled && Array.isArray(d)) setItems(d as MediaRow[]);
        else if (!cancelled) setItems([]);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkId, listVersion]);

  const images = items.filter((a) => a.mime_type?.startsWith("image/"));

  if (loading) {
    return <p className="text-xs text-zinc-400">Loading photos…</p>;
  }
  if (images.length === 0) {
    return (
      <p className="text-xs text-amber-700">
        No verification photos on file for this check (older checks may pre-date this requirement).
      </p>
    );
  }

  return (
    <div>
      <div className="text-xs font-bold text-zinc-500 uppercase mb-2">Verification photos</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {images.map((a) => (
          <a
            key={a.id}
            href={mediaAttachmentFileUrl({
              entity_type: "driver_vehicle_check",
              entity_id: checkId,
              file_name: a.file_name,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-zinc-200 overflow-hidden bg-zinc-50 hover:ring-2 hover:ring-blue-400/50"
          >
            <img
              src={mediaAttachmentFileUrl({
                entity_type: "driver_vehicle_check",
                entity_id: checkId,
                file_name: a.file_name,
              })}
              alt={dvcPhotoLabel(a.category)}
              className="w-full h-24 object-cover"
            />
            <div className="px-2 py-1 text-[10px] text-zinc-600 truncate">{dvcPhotoLabel(a.category)}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

interface VehicleOption {
  id: string;
  code: string;
  make: string;
  model: string;
  /** Used by the driver combobox to look up only operators cleared for that class. */
  asset_class?: string | null;
}

interface CheckRow {
  id: string;
  vehicle_id: string;
  vehicle_code: string;
  vehicle_make: string;
  vehicle_model: string;
  driver_name: string;
  mileage_km: number | null;
  check_date: string;
  route_from: string;
  route_to: string;
  direction: string;
  overall_pass: number;
  has_exceptions: number;
  exception_approved: number;
  approved_by: string;
  remarks: string;
  created_at: string;
  // status check fields (pass | fail)
  [key: string]: unknown;
}

const STATUS_KEYS = [
  "electrics_front_lights", "electrics_rear_lights", "electrics_indicators",
  "electrics_brake_lights", "electrics_horn", "electrics_windows",
  "electrics_central_locking", "electrics_wipers", "electrics_dashboard_gauges",
  "electrics_ac_heating", "fluids_engine_oil", "fluids_engine_coolant",
  "fluids_power_steering", "fluids_transmission", "fluids_fuel",
  "drive_steering", "drive_brakes", "drive_tire_pressure",
  "visual_spare_wheel_condition", "visual_doors",
];

const EQUIP_KEYS = [
  "equip_jack", "equip_spare_wheel", "equip_triangle", "equip_jump_leads",
  "equip_fire_extinguisher", "equip_phone_charger", "equip_first_aid_kit",
  "equip_flashlight", "equip_tool_wheel_spanners", "equip_tool_multimeter",
  "equip_tool_cable_cutters", "equip_tool_pliers", "equip_tool_tow_straps",
  "equip_tool_inverter",
];

export default function VehicleChecksPage() {
  const { organizationId } = useAuth();
  const { active, trackId, stepIndex } = useTutorial();
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!active || trackId !== "driverCheck") return;
    if (stepIndex >= 2) setShowForm(true);
  }, [active, trackId, stepIndex]);

  const loadChecks = useCallback(() => {
    fetch(`/api/driver-vehicle-checks?org=${organizationId}`)
      .then((r) => r.json())
      .then((d) => { setChecks(d); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [organizationId]);

  useEffect(() => {
    loadChecks();
    fetch(`/api/vehicles?org=${organizationId}`)
      .then((r) => r.json())
      .then(setVehicles)
      .catch(() => {});
  }, [loadChecks, organizationId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            {checks.length} vehicle check{checks.length !== 1 ? "s" : ""} recorded
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            Includes typed odometer + odometer photo, front/rear/sides photos, then the checklist. Complete before deployment; check out under Trips.
          </p>
        </div>
        <span data-tutorial="tutorial-vehicle-checks-new">
          <Button
            onClick={() => setShowForm(!showForm)}
            size="lg"
            className="touch-manipulation min-h-[48px]"
          >
            + New vehicle check
          </Button>
        </span>
      </div>

      {showForm && (
        <DriverVehicleCheckForm
          vehicles={vehicles}
          organizationId={organizationId}
          onComplete={() => { setShowForm(false); loadChecks(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <div className="text-zinc-500 text-center py-12">Loading…</div>
      ) : checks.length === 0 ? (
        <div className="text-zinc-500 text-center py-12">No vehicle checks yet. Start one above.</div>
      ) : (
        <div className="space-y-3">
          {checks.map((check) => (
            <CheckCard
              key={check.id}
              check={check}
              organizationId={organizationId}
              onDeleted={loadChecks}
              onApproved={loadChecks}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckCard({
  check,
  organizationId,
  onDeleted,
  onApproved,
}: {
  check: CheckRow;
  organizationId: string;
  onDeleted: () => void;
  onApproved: () => void;
}) {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveGate, setApproveGate] = useState<boolean | null>(null);
  const [attachListRev, setAttachListRev] = useState(0);

  const failCount = STATUS_KEYS.filter((k) => check[k] === "fail").length;
  const missingEquip = EQUIP_KEYS.filter((k) => check[k] === 0).length;
  const needsApproval = check.has_exceptions === 1 && check.exception_approved === 0;
  const roleCanApprove =
    !!user &&
    (user.role === "fleet_lead" || user.role === "manager" || user.role === "admin");
  const canApprove =
    approveGate !== null ? approveGate : roleCanApprove;

  useEffect(() => {
    if (!user) {
      setApproveGate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(
          `/api/me/vehicle-check-can-approve?org=${encodeURIComponent(organizationId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { canApprove?: boolean };
        if (!cancelled) setApproveGate(!!data.canApprove);
      } catch {
        if (!cancelled) setApproveGate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, organizationId]);

  async function handleDelete() {
    if (!window.confirm("Delete this vehicle check permanently?")) return;
    setIsDeleting(true);
    const res = await fetch(
      `/api/driver-vehicle-checks/${check.id}?org=${encodeURIComponent(organizationId)}`,
      { method: "DELETE" }
    );
    setIsDeleting(false);
    if (res.ok) onDeleted();
  }

  async function handleApprove() {
    setIsApproving(true);
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/driver-vehicle-checks/${check.id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        approvedBy: user?.name || user?.email || "",
        approvalMethod: "in-app",
      }),
    });
    setIsApproving(false);
    if (res.ok) onApproved();
  }

  return (
    <Card className={!check.overall_pass ? "border-red-200" : needsApproval ? "border-amber-200" : ""}>
      <div className="p-4">
        <div
          className="flex items-center justify-between gap-2 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsExpanded(!isExpanded); } }}
          role="button"
          tabIndex={0}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Badge variant="secondary" className="text-base font-bold shrink-0">
              {check.vehicle_code}
            </Badge>
            <div className="min-w-0">
              <div className="font-medium capitalize">
                {check.direction === "returning" ? "Returning" : "Departing"} check
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                {check.driver_name || "Unknown"} · {new Date(check.created_at).toLocaleString()}
                {check.route_from && check.route_to && (
                  <span> · {check.route_from} → {check.route_to}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {needsApproval && <Badge variant="warning">Needs approval</Badge>}
            {failCount > 0 && <Badge variant="destructive">{failCount} fail</Badge>}
            {missingEquip > 0 && <Badge variant="warning">{missingEquip} missing</Badge>}
            {failCount === 0 && missingEquip === 0 && <Badge variant="success">All pass</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-zinc-100" onClick={(e) => e.stopPropagation()}>
          {needsApproval && canApprove && (
            <Button
              type="button"
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white touch-manipulation"
              disabled={isApproving}
              onClick={() => void handleApprove()}
            >
              {isApproving ? "Approving…" : "Approve exceptions"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50 touch-manipulation"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-zinc-100 p-4 space-y-4">
          {check.mileage_km != null && (
            <div className="text-sm text-zinc-600">Mileage: <strong>{check.mileage_km.toLocaleString()} km</strong></div>
          )}

          <DriverCheckVerificationPhotos checkId={check.id} listVersion={attachListRev} />

          {user && (
            <div className="pt-2 border-t border-zinc-100">
              <p className="text-xs text-zinc-500 mb-2">Add or replace photos</p>
              <MediaUpload
                entityType="driver_vehicle_check"
                entityId={check.id}
                organizationId={organizationId}
                uploadedById={user.id}
                uploadedByName={user.name || user.email || ""}
                defaultCategory="dvc-exterior-front"
                onAttachmentsChanged={() => setAttachListRev((n) => n + 1)}
              />
            </div>
          )}

          {/* Status items */}
          <div>
            <div className="text-xs font-bold text-zinc-500 uppercase mb-2">Status checks</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
              {STATUS_KEYS.map((k) => {
                const label = k.replace(/^(electrics|fluids|drive|visual)_/, "").replace(/_/g, " ");
                const val = check[k];
                return (
                  <div key={k} className={`text-xs px-2 py-1 rounded ${val === "fail" ? "bg-red-50 text-red-800" : "text-zinc-600"}`}>
                    <span className={val === "fail" ? "font-semibold" : ""}>{val === "fail" ? "✗" : "✓"}</span>{" "}
                    <span className="capitalize">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Equipment */}
          <div>
            <div className="text-xs font-bold text-zinc-500 uppercase mb-2">Equipment</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
              {EQUIP_KEYS.map((k) => {
                const label =
                  k === "equip_phone_charger"
                    ? "1pwr phone in vehicle"
                    : k.replace(/^equip_(tool_)?/, "").replace(/_/g, " ");
                const val = check[k];
                return (
                  <div key={k} className={`text-xs px-2 py-1 rounded ${val === 0 ? "bg-amber-50 text-amber-800" : "text-zinc-600"}`}>
                    <span className={val === 0 ? "font-semibold" : ""}>{val === 0 ? "✗" : "✓"}</span>{" "}
                    <span className="capitalize">{label}</span>
                  </div>
                );
              })}
            </div>
            {typeof check.travel_phone_number === "string" && check.travel_phone_number.trim() !== "" && (
              <div className="mt-2 text-sm text-zinc-700">
                <span className="font-medium">1PWR phone #:</span>{" "}
                <span className="text-zinc-600">{check.travel_phone_number}</span>
              </div>
            )}
          </div>

          {check.remarks && (
            <div className="text-sm">
              <span className="font-medium text-zinc-700">Remarks:</span>{" "}
              <span className="text-zinc-600">{check.remarks}</span>
            </div>
          )}

          {check.approved_by && (
            <div className="text-xs text-zinc-500">
              Exceptions approved by <strong>{check.approved_by}</strong>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
