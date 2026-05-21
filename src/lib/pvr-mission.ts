import type Database from "better-sqlite3";

/** Compare calendar YYYY-MM-DD strings (inclusive window). */
export function tripDateWithinMissionWindow(
  tripDate: string,
  departureDate: string,
  returnDate: string
): boolean {
  const t = String(tripDate || "").trim().slice(0, 10);
  const d = String(departureDate || "").trim().slice(0, 10);
  const rRaw = String(returnDate || "").trim().slice(0, 10);
  const r = rRaw || d;
  if (!t || !d) return false;
  return t >= d && t <= r;
}

export type MissionRowForPvr = {
  id: string;
  organization_id: string;
  approval_status: string;
  lifecycle_status: string;
  departure_date: string;
  return_date: string;
  title: string;
  destination: string;
};

export function validateMissionForPvrClaim(
  mission: MissionRowForPvr,
  orgId: string,
  tripDate: string
): { ok: true } | { ok: false; error: string } {
  if (String(mission.organization_id) !== orgId) {
    return { ok: false, error: "Mission belongs to a different organization." };
  }
  if (String(mission.approval_status || "").toLowerCase() !== "approved") {
    return {
      ok: false,
      error: "Only an approved mission can be linked to a personal vehicle reimbursement claim.",
    };
  }
  if (String(mission.lifecycle_status || "active").toLowerCase() !== "active") {
    return {
      ok: false,
      error: "Mission must be active (not cancelled or deferred) to link a reimbursement claim.",
    };
  }
  if (!tripDateWithinMissionWindow(tripDate, mission.departure_date, mission.return_date)) {
    return {
      ok: false,
      error:
        "Trip date must fall within the mission departure and return dates for the selected mission.",
    };
  }
  return { ok: true };
}

export function getMissionForPvr(
  db: Database.Database,
  missionId: string
): MissionRowForPvr | undefined {
  const row = db
    .prepare(
      `SELECT id, organization_id, approval_status, lifecycle_status, departure_date, return_date, title, destination
       FROM missions WHERE id = ?`
    )
    .get(missionId) as MissionRowForPvr | undefined;
  return row;
}
