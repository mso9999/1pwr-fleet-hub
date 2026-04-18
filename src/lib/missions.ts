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
  }
): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO missions (
      id, organization_id, title, destination, departure_date, return_date,
      mission_type, passengers, loadout_summary, notes, status, approval_status,
      created_by_id, created_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', 'pending', ?, ?, ?, ?)
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
    input.createdById,
    input.createdByName,
    now,
    now
  );
  return id;
}
