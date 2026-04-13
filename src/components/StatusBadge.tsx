"use client";

import { Badge } from "@/components/ui/badge";
import type { VehicleStatus, WorkOrderStatus, WorkOrderPriority } from "@/types";
import { useT } from "@/i18n/locale-context";

const vehicleStatusVariants: Record<
  string,
  "success" | "info" | "warning" | "destructive" | "secondary" | "default"
> = {
  operational: "success",
  deployed: "info",
  "maintenance-hq": "warning",
  "maintenance-3rdparty": "warning",
  "awaiting-parts": "destructive",
  grounded: "destructive",
  "written-off": "secondary",
};

const workOrderStatusVariants: Record<
  string,
  "success" | "info" | "warning" | "destructive" | "secondary" | "default"
> = {
  submitted: "info",
  queued: "default",
  "in-progress": "warning",
  "awaiting-parts": "destructive",
  completed: "success",
  closed: "secondary",
  "return-repair": "warning",
  cancelled: "secondary",
  rejected: "destructive",
};

const priorityVariants: Record<
  string,
  "success" | "info" | "warning" | "destructive" | "secondary" | "default"
> = {
  critical: "destructive",
  high: "warning",
  medium: "info",
  low: "secondary",
};

function tr(
  t: (path: string) => string,
  kind: "vehicle" | "workOrder" | "priority",
  key: string
): string {
  const path = `status.${kind}.${key}`;
  const s = t(path);
  return s === path ? key : s;
}

export function VehicleStatusBadge({ status }: { status: VehicleStatus }): React.ReactElement {
  const t = useT();
  const variant = vehicleStatusVariants[status] ?? "default";
  return <Badge variant={variant}>{tr(t, "vehicle", status)}</Badge>;
}

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }): React.ReactElement {
  const t = useT();
  const variant = workOrderStatusVariants[status] ?? "default";
  return <Badge variant={variant}>{tr(t, "workOrder", status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: WorkOrderPriority }): React.ReactElement {
  const t = useT();
  const variant = priorityVariants[priority] ?? "default";
  return <Badge variant={variant}>{tr(t, "priority", priority)}</Badge>;
}
