"use client";

import { useEffect, useState } from "react";
import { FuelBudgetPanel, type FuelStopDraft } from "@/components/FuelBudgetPanel";
import { useAuth } from "@/lib/auth-context";
import type { FuelDisposition } from "@/lib/fuel-calculator";
import { Select } from "@/components/ui/select";

export default function FuelCalculatorPage(): React.ReactElement {
  const { user, organizationId } = useAuth();
  const [tripShape, setTripShape] = useState<"one_way" | "round_trip" | "multi_stop">("round_trip");
  const [stops, setStops] = useState<FuelStopDraft[]>([
    { label: "HQ", siteCode: "HQ", lat: null, lng: null },
    { label: "", siteCode: "", lat: null, lng: null },
  ]);
  const [disposition, setDisposition] = useState<FuelDisposition>("");

  useEffect(() => {
    setStops([
      { label: "HQ", siteCode: "HQ", lat: null, lng: null },
      { label: "", siteCode: "", lat: null, lng: null },
    ]);
  }, [organizationId]);

  if (!user) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-sm text-zinc-600">Sign in to use the fuel calculator.</div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Fuel calculator</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Price a trip without creating a mission. Same Excel formula as mission planning (budget = cost ×
          safety factor).
        </p>
      </div>

      <div className="max-w-xs">
        <Select
          label="Trip shape"
          value={tripShape}
          onChange={(e) =>
            setTripShape(e.target.value as "one_way" | "round_trip" | "multi_stop")
          }
        >
          <option value="one_way">One way</option>
          <option value="round_trip">Round trip</option>
          <option value="multi_stop">Multi-stop</option>
        </Select>
      </div>

      <FuelBudgetPanel
        organizationId={organizationId}
        tripShape={tripShape}
        stops={stops}
        onStopsChange={setStops}
        disposition={disposition}
        onDispositionChange={setDisposition}
        compact
      />
    </div>
  );
}
