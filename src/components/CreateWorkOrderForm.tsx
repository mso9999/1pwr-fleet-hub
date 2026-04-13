"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WORK_ORDER_TYPE, WORK_ORDER_PRIORITY, REPAIR_LOCATION } from "@/types";
import { useAuth } from "@/lib/auth-context";

export interface VehicleOption {
  id: string;
  code: string;
  make: string;
  model: string;
}

export const WORK_ORDER_MECHANICS = ["Tebesi", "Kola", "Thene", "Molefe", "Khanare", "Seutloali", "Kubutu", "Kelebone"];
export const WORK_ORDER_THIRD_PARTY_SHOPS = [
  "BFN",
  "Delter",
  "ECU Express Germiston",
  "John Williams",
  "Midas",
  "Lesotho Nissan",
  "Selematsela",
  "KET",
];

export interface CreateWorkOrderFormProps {
  vehicles: VehicleOption[];
  organizationId: string;
  onCreated: () => void;
  onCancel: () => void;
  /** Pre-select vehicle (vehicle detail page). */
  defaultVehicleId?: string;
  /** Hide vehicle selector; use with defaultVehicleId. */
  lockVehicle?: boolean;
  /** Prefill remarks (e.g. vehicle identity block). */
  defaultRemarks?: string;
}

export function CreateWorkOrderForm({
  vehicles,
  organizationId,
  onCreated,
  onCancel,
  defaultVehicleId,
  lockVehicle,
  defaultRemarks,
}: CreateWorkOrderFormProps): React.ReactElement {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [repairLoc, setRepairLoc] = useState("hq");

  const lockedVehicle = lockVehicle && defaultVehicleId
    ? vehicles.find((v) => v.id === defaultVehicleId)
    : undefined;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const vehicleId = lockVehicle && defaultVehicleId ? defaultVehicleId : (fd.get("vehicleId") as string);
    const body = {
      organizationId,
      vehicleId,
      title: fd.get("title"),
      description: fd.get("description"),
      type: fd.get("type"),
      priority: fd.get("priority"),
      assignedTo: fd.get("assignedTo"),
      repairLocation: fd.get("repairLocation"),
      thirdPartyShop: fd.get("thirdPartyShop") || "",
      remarks: fd.get("remarks"),
      reportedBy: user?.name || "",
      reportedById: user?.id || "",
    };

    const res = await fetch("/api/work-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onCreated();
    else setIsSubmitting(false);
  }

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader><CardTitle>New Work Order</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          {lockVehicle && lockedVehicle ? (
            <div className="sm:col-span-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
              <span className="text-xs font-medium text-zinc-500 uppercase">Vehicle</span>
              <div className="font-medium">
                {lockedVehicle.code} — {lockedVehicle.make} {lockedVehicle.model}
              </div>
              <input type="hidden" name="vehicleId" value={lockedVehicle.id} />
            </div>
          ) : (
            <Select name="vehicleId" label="Vehicle *" required defaultValue={defaultVehicleId || ""}>
              <option value="">Select vehicle...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.code} — {v.make} {v.model}</option>
              ))}
            </Select>
          )}
          <Input name="title" label="Title *" required placeholder="e.g. Engine rebuild" />
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-zinc-700">Description</label>
            <textarea
              name="description"
              rows={2}
              className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              placeholder="Detailed description of the issue and work needed"
            />
          </div>
          <Select name="type" label="Type *" required>
            {Object.values(WORK_ORDER_TYPE).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Select name="priority" label="Priority *" required>
            {Object.values(WORK_ORDER_PRIORITY).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
          <Select name="assignedTo" label="Assign To">
            <option value="">Unassigned</option>
            {WORK_ORDER_MECHANICS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
          <Select name="repairLocation" label="Repair Location" value={repairLoc} onChange={(e) => setRepairLoc(e.target.value)}>
            {Object.values(REPAIR_LOCATION).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
          {repairLoc === "3rd-party" && (
            <Select name="thirdPartyShop" label="3rd Party Shop">
              <option value="">Select shop...</option>
              {WORK_ORDER_THIRD_PARTY_SHOPS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          )}
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-zinc-700">Remarks</label>
            <textarea
              name="remarks"
              rows={3}
              defaultValue={defaultRemarks || ""}
              className="mt-1.5 flex w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
            />
          </div>
          <div className="sm:col-span-2 flex gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Work Order"}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
