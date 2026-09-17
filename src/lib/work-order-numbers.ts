/**
 * Human-readable work-order numbers, e.g. WO-LS-2026-00042.
 * Allocated per organisation + calendar year from the work_order_seq table
 * (same pattern as issue-ticket UIDs). Always call inside the creating
 * transaction so a failed insert can't burn a sequence number.
 */
import type Database from "better-sqlite3";

export function allocateWorkOrderNumber(db: Database.Database, organizationId: string): string {
  const org = db.prepare("SELECT code FROM organizations WHERE id = ?").get(organizationId) as
    | { code: string }
    | undefined;
  const short =
    (org?.code || "ORG")
      .replace(/^1PWR-/i, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 4)
      .toUpperCase() || "ORG";
  const year = new Date().getFullYear();

  const existing = db
    .prepare(`SELECT seq FROM work_order_seq WHERE organization_id = ? AND year = ?`)
    .get(organizationId, year) as { seq: number } | undefined;
  if (!existing) {
    db.prepare(`INSERT INTO work_order_seq (organization_id, year, seq) VALUES (?, ?, 0)`).run(organizationId, year);
  }
  db.prepare(`UPDATE work_order_seq SET seq = seq + 1 WHERE organization_id = ? AND year = ?`).run(
    organizationId,
    year
  );
  const row = db
    .prepare(`SELECT seq FROM work_order_seq WHERE organization_id = ? AND year = ?`)
    .get(organizationId, year) as { seq: number };
  return `WO-${short}-${year}-${String(row.seq).padStart(5, "0")}`;
}
