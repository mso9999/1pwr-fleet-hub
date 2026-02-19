"use client";

import { Badge } from "@/components/ui/badge";
import type { VehicleStatus, WorkOrderStatus, WorkOrderPriority } from "@/types";

const vehicleStatusConfig: Record<string, { label: string; variant: "success" | "info" | "warning" | "destructive" | "secondary" | "default" }> = {
  operational: { label: "Operational", variant: "success" },
  deployed: { label: "Deployed", variant: "info" },
  "maintenance-hq": { label: "Maint. HQ", variant: "warning" },
  "maintenance-3rdparty": { label: "Maint. 3rd Party", variant: "warning" },
  "awaiting-parts": { label: "Awaiting Parts", variant: "destructive" },
  grounded: { label: "Grounded", variant: "destructive" },
  "written-off": { label: "Written Off", variant: "secondary" },
};

const workOrderStatusConfig: Record<string, { label: string; variant: "success" | "info" | "warning" | "destructive" | "secondary" | "default" }> = {
  submitted: { label: "Submitted", variant: "info" },
  queued: { label: "Queued", variant: "default" },
  "in-progress": { label: "In Progress", variant: "warning" },
  "awaiting-parts": { label: "Awaiting Parts", variant: "destructive" },
  completed: { label: "Completed", variant: "success" },
  closed: { label: "Closed", variant: "secondary" },
  "return-repair": { label: "Return & Repair", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "secondary" },
  rejected: { label: "Rejected", variant: "destructive" },
};

const priorityConfig: Record<string, { label: string; variant: "success" | "info" | "warning" | "destructive" | "secondary" | "default" }> = {
  critical: { label: "Critical", variant: "destructive" },
  high: { label: "High", variant: "warning" },
  medium: { label: "Medium", variant: "info" },
  low: { label: "Low", variant: "secondary" },
};

export function VehicleStatusBadge({ status }: { status: VehicleStatus }): React.ReactElement {
  const config = vehicleStatusConfig[status] || { label: status, variant: "default" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }): React.ReactElement {
  const config = workOrderStatusConfig[status] || { label: status, variant: "default" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: WorkOrderPriority }): React.ReactElement {
  const config = priorityConfig[priority] || { label: priority, variant: "default" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
