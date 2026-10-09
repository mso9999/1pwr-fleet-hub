import { Badge } from "@/components/ui/badge";
import { isSecondmentOverdue, secondmentDirection } from "@/lib/vehicle-org-scope";

export interface SecondmentBadgeVehicle {
  organization_id?: string | null;
  seconded_to_org?: string | null;
  secondment_start?: string | null;
  secondment_expected_return?: string | null;
}

/** "Seconded from LS" (borrower's view) / "Seconded to ZM" (owner's view); nothing when not seconded. */
export function SecondmentBadge({
  vehicle,
  viewerOrgId,
  ownerCountry,
  secondedToCountry,
  todayYmd,
  showDates = false,
}: {
  vehicle: SecondmentBadgeVehicle;
  viewerOrgId: string;
  ownerCountry?: string | null;
  secondedToCountry?: string | null;
  todayYmd: string;
  showDates?: boolean;
}): React.ReactElement | null {
  const direction = secondmentDirection(vehicle, viewerOrgId);
  if (!direction) return null;
  const overdue = isSecondmentOverdue(vehicle, todayYmd);
  const label =
    direction === "in"
      ? `Seconded from ${ownerCountry || vehicle.organization_id}`
      : `Seconded to ${secondedToCountry || vehicle.seconded_to_org}`;
  const start = String(vehicle.secondment_start || "").slice(0, 10);
  const ret = String(vehicle.secondment_expected_return || "").slice(0, 10);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge
        variant="secondary"
        className={
          direction === "in"
            ? "text-[10px] font-semibold bg-violet-100 text-violet-900"
            : "text-[10px] font-semibold bg-sky-100 text-sky-900"
        }
        title={`Since ${start || "—"} · expected return ${ret || "open-ended"}`}
      >
        {label}
      </Badge>
      {overdue && (
        <Badge variant="destructive" className="text-[10px] font-semibold">
          Return overdue
        </Badge>
      )}
      {showDates && (
        <span className="text-xs text-zinc-500">
          {start || "—"} → {ret || "open-ended"}
        </span>
      )}
    </span>
  );
}
