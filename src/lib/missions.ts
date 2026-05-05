import type { Database } from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

export function insertPlannedMission(
  db: Database,
  input: {
    organizationId: string;
    title: string;
    destination: string;
    departureDate: string;
    returnDate: string;
    missionType: string;
    passengers: string;
    loadoutSummary: string;
    notes: string;
    createdById: string;
    createdByName: string;
    missionProfile?: string;
    requiredVehicleClass?: string;
    rrStatus?: string;
  }
): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  const profile = String(input.missionProfile || "local").toLowerCase() === "field" ? "field" : "local";
  const reqClass = String(input.requiredVehicleClass || "").trim();
  const rr = String(input.rrStatus || "na").toLowerCase();
  const rrNorm = rr === "pending" || rr === "approved" ? rr : "na";

  db.prepare(`
    INSERT INTO missions (
      id, organization_id, title, destination, departure_date, return_date,
      mission_type, passengers, loadout_summary, notes, status, approval_status,
      mission_profile, required_vehicle_class, rr_status,
      created_by_id, created_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', 'pending', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.organizationId,
    input.title,
    input.destination,
    input.departureDate,
    input.returnDate,
    input.missionType || "other",
    input.passengers,
    input.loadoutSummary,
    input.notes,
    profile,
    reqClass,
    rrNorm,
    input.createdById,
    input.createdByName,
    now,
    now
  );
  return id;
}
