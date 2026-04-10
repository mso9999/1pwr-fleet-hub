import type Database from "better-sqlite3";

/**
 * Allocate next human-readable ticket UID per organisation and calendar year, e.g. IR-LS-2026-00001.
 */
export function allocateIssueTicketUid(db: Database.Database, organizationId: string): string {
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
    .prepare(`SELECT seq FROM issue_ticket_seq WHERE organization_id = ? AND year = ?`)
    .get(organizationId, year) as { seq: number } | undefined;
  if (!existing) {
    db.prepare(`INSERT INTO issue_ticket_seq (organization_id, year, seq) VALUES (?, ?, 0)`).run(organizationId, year);
  }
  db.prepare(`UPDATE issue_ticket_seq SET seq = seq + 1 WHERE organization_id = ? AND year = ?`).run(
    organizationId,
    year
  );
  const row = db
    .prepare(`SELECT seq FROM issue_ticket_seq WHERE organization_id = ? AND year = ?`)
    .get(organizationId, year) as { seq: number };
  const n = row.seq;
  return `IR-${short}-${year}-${String(n).padStart(5, "0")}`;
}
