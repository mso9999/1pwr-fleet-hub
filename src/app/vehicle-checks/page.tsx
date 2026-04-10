"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { DriverVehicleCheckForm } from "@/components/DriverVehicleCheckForm";

interface VehicleOption {
  id: string;
  code: string;
  make: string;
  model: string;
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
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

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
            Required before each vehicle deployment. Complete the checklist, then check out a vehicle under Trips.
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

  const failCount = STATUS_KEYS.filter((k) => check[k] === "fail").length;
  const missingEquip = EQUIP_KEYS.filter((k) => check[k] === 0).length;
  const needsApproval = check.has_exceptions === 1 && check.exception_approved === 0;
  const canApprove = user && (user.role === "fleet_lead" || user.role === "manager" || user.role === "admin");

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
    const res = await fetch(`/api/driver-vehicle-checks/${check.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
                const label = k.replace(/^equip_(tool_)?/, "").replace(/_/g, " ");
                const val = check[k];
                return (
                  <div key={k} className={`text-xs px-2 py-1 rounded ${val === 0 ? "bg-amber-50 text-amber-800" : "text-zinc-600"}`}>
                    <span className={val === 0 ? "font-semibold" : ""}>{val === 0 ? "✗" : "✓"}</span>{" "}
                    <span className="capitalize">{label}</span>
                  </div>
                );
              })}
            </div>
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
