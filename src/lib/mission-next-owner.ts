/**
 * Named next-owner for mission → trip → allocate → depart.
 * Keeps stage order; makes ownership explicit to avoid diffusion of responsibility.
 */

export type MissionNextOwnerKind =
  | "await_approval"
  | "create_trip"
  | "allocate_vehicle"
  | "checklist_or_depart"
  | "in_progress"
  | "done"
  | "inactive"
  | "none";

export type MissionNextOwner = {
  kind: MissionNextOwnerKind;
  /** Role that must act next (plain language). */
  owner: string;
  /** One-line instruction. */
  action: string;
  /** Optional deep link for the next action. */
  href?: string;
  tone: "amber" | "blue" | "emerald" | "zinc";
};

export type MissionNextOwnerInput = {
  id: string;
  approval_status?: string | null;
  lifecycle_status?: string | null;
  trip_id?: string | null;
  assigned_vehicle_id?: string | null;
  assigned_vehicle_code?: string | null;
  transport_mode?: string | null;
  trip_departed_at?: string | null;
  trip_checkin_at?: string | null;
  created_by_name?: string | null;
};

function isCompanyVehicleMode(transportMode: string | null | undefined): boolean {
  const m = String(transportMode || "company_vehicle").toLowerCase().replace(/-/g, "_");
  return m === "" || m === "company_vehicle";
}

function hasPhysicalVehicle(m: MissionNextOwnerInput): boolean {
  const id = String(m.assigned_vehicle_id || "").trim();
  if (!id) return false;
  if (id.startsWith("unallocated_")) return false;
  if (String(m.assigned_vehicle_code || "").toUpperCase() === "UNALLOCATED") return false;
  return true;
}

/**
 * Resolve who must act next on an approved (or pending) mission.
 */
export function resolveMissionNextOwner(m: MissionNextOwnerInput): MissionNextOwner {
  const approval = String(m.approval_status || "").toLowerCase();
  const life = String(m.lifecycle_status || "active").toLowerCase();
  const creator = String(m.created_by_name || "").trim();
  const requestorLabel = creator
    ? `Requestor / driver (${creator})`
    : "Requestor / designated driver";

  if (life === "deferred" || life === "capacity_cancelled" || life === "checkout_hold") {
    return {
      kind: "inactive",
      owner: "Management",
      action: `Mission is ${life.replace(/_/g, " ")} — reactivate before continuing.`,
      tone: "amber",
    };
  }

  if (approval === "rejected") {
    return {
      kind: "none",
      owner: "—",
      action: "Mission was rejected.",
      tone: "zinc",
    };
  }

  if (approval !== "approved") {
    return {
      kind: "await_approval",
      owner: "Mission approver (PM)",
      action: "Approve or reject this trip plan. Fleet lead does not approve missions.",
      tone: "amber",
    };
  }

  if (m.trip_checkin_at) {
    return {
      kind: "done",
      owner: "—",
      action: "Trip checked in — mission complete.",
      tone: "emerald",
    };
  }

  if (m.trip_departed_at) {
    return {
      kind: "in_progress",
      owner: "Driver",
      action: "Trip is underway — check in on return.",
      href: m.trip_id ? `/trips?trip=${encodeURIComponent(m.trip_id)}` : undefined,
      tone: "blue",
    };
  }

  const tripId = String(m.trip_id || "").trim();
  if (!tripId) {
    return {
      kind: "create_trip",
      owner: requestorLabel,
      action:
        "Create the planned trip from this approved mission. Fleet cannot allocate a vehicle until the trip exists.",
      href: `/trips?mission=${encodeURIComponent(m.id)}`,
      tone: "amber",
    };
  }

  if (isCompanyVehicleMode(m.transport_mode) && !hasPhysicalVehicle(m)) {
    return {
      kind: "allocate_vehicle",
      owner: "Fleet lead",
      action:
        "Allocate a pool vehicle to this trip (Missions page → Fleet allocate card, or Request details).",
      href: "/vehicle-requests",
      tone: "blue",
    };
  }

  return {
    kind: "checklist_or_depart",
    owner: "Driver",
    action: "Complete the departing vehicle checklist, then start the trip.",
    href: `/trips?trip=${encodeURIComponent(tripId)}`,
    tone: "emerald",
  };
}
