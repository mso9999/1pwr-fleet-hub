/**
 * Daily pass over mission-linked vehicle requests that still have no vehicle.
 *
 * Two cases:
 * - Orphan: the mission is already terminal (cleared for no trip, cancelled for
 *   capacity, or rejected). The request can never be allocated, so it is
 *   cancelled on sight.
 * - Live: the mission is approved and active. Warn at 7 days, cancel at 14,
 *   and never cancel on the run that first warns.
 *
 * Deferred missions and missions still waiting for approval are left alone:
 * deferral is a hold, and approval has its own timeout.
 */
import type Database from "better-sqlite3";
import { sendMail, type MailResult } from "@/lib/mailer";
import { recordMutation } from "@/lib/record-mutation-log";
import { addCalendarDays, calendarDaysBetween, parseDbTime } from "@/lib/stale-approval";
import {
  ALLOCATION_CANCEL_AFTER_DAYS,
  ALLOCATION_WARN_AFTER_DAYS,
  decideStaleAllocation,
} from "@/lib/stale-allocation";

const SYSTEM_ACTOR = { id: "system", name: "Fleet Hub", role: "", department: "" };

export const ALLOCATION_CANCEL_REASON =
  `Automatically cancelled: still unallocated ${ALLOCATION_CANCEL_AFTER_DAYS} days after the mission was approved.`;
const ORPHAN_REASON = "Cancelled: the mission is no longer active, so this request can no longer be allocated.";

export interface StaleAllocationSummary {
  warned: number;
  cancelled: number;
  orphansClosed: number;
  emailsSent: number;
  emailFailures: number;
}

interface Candidate {
  id: string;
  organizationId: string;
  title: string;
  requestorId: string;
  pendingSince: Date | null;
  kind: "warn" | "cancel" | "orphan";
}

type SendMailFn = (message: { to: string[]; subject: string; text: string }) => Promise<MailResult>;

export async function runStaleAllocationCleanup(
  db: Database.Database,
  opts?: { now?: Date; sendMail?: SendMailFn },
): Promise<StaleAllocationSummary> {
  const now = opts?.now ?? new Date();
  const mail = opts?.sendMail ?? sendMail;
  const summary: StaleAllocationSummary = { warned: 0, cancelled: 0, orphansClosed: 0, emailsSent: 0, emailFailures: 0 };
  const candidates = loadCandidates(db, now);
  const leads = fleetLeads(db);

  type Bucket = { warnings: Candidate[]; closures: Candidate[] };
  const byRecipient = new Map<string, Bucket>();
  const warnOk = new Set<string>();

  for (const item of candidates) {
    const recipients = recipientsFor(db, item, leads);
    if (item.kind === "warn" && recipients.length === 0) continue;
    for (const email of recipients) {
      const bucket = byRecipient.get(email) ?? { warnings: [], closures: [] };
      if (item.kind === "warn") bucket.warnings.push(item);
      else bucket.closures.push(item);
      byRecipient.set(email, bucket);
    }
  }

  for (const [email, bucket] of byRecipient) {
    const result = await mail({ to: [email], subject: subjectFor(bucket), text: digestText(bucket, now) });
    if (result.ok) {
      summary.emailsSent += 1;
      for (const item of bucket.warnings) warnOk.add(item.id);
    } else {
      summary.emailFailures += 1;
    }
  }

  const nowIso = now.toISOString();
  const closed = new Set<string>();
  for (const item of candidates) {
    if (item.kind === "warn") {
      if (!warnOk.has(item.id)) continue;
      markWarned(db, item, nowIso);
      summary.warned += 1;
    } else if (!closed.has(item.id)) {
      if (!cancelRequest(db, item, item.kind === "orphan" ? ORPHAN_REASON : ALLOCATION_CANCEL_REASON, nowIso)) continue;
      closed.add(item.id);
      if (item.kind === "orphan") summary.orphansClosed += 1;
      else summary.cancelled += 1;
    }
  }
  return summary;
}

/**
 * Cancel every unallocated request on a mission. Used when the mission itself
 * is cleared, so its requests leave the allocation queue in the same step.
 * Returns how many requests were cancelled.
 */
export function closeUnallocatedRequests(
  db: Database.Database,
  missionId: string,
  reason: string,
  nowIso: string,
): number {
  const rows = db
    .prepare(
      `SELECT id, organization_id, purpose, destination, departure_date
       FROM vehicle_requests
       WHERE mission_id = ? AND lower(status) IN ('requested', 'approved')
         AND trim(COALESCE(assigned_vehicle_id, '')) = ''`,
    )
    .all(missionId) as Array<Record<string, string | null>>;
  let closed = 0;
  for (const row of rows) {
    const item: Candidate = {
      id: String(row.id),
      organizationId: String(row.organization_id || ""),
      title: label(row.purpose, row.destination, row.departure_date),
      requestorId: "",
      pendingSince: null,
      kind: "orphan",
    };
    if (cancelRequest(db, item, reason, nowIso)) closed += 1;
  }
  return closed;
}

function loadCandidates(db: Database.Database, now: Date): Candidate[] {
  const rows = db
    .prepare(
      `SELECT vr.id, vr.organization_id, vr.purpose, vr.destination, vr.departure_date,
              vr.requested_by_id, vr.created_at, vr.stale_allocation_warned_at,
              m.id AS mission_id, lower(COALESCE(m.approval_status, '')) AS approval_status,
              lower(COALESCE(m.lifecycle_status, 'active')) AS lifecycle_status, m.approved_at
       FROM vehicle_requests vr
       LEFT JOIN missions m ON m.id = vr.mission_id
       WHERE lower(vr.status) IN ('requested', 'approved')
         AND trim(COALESCE(vr.assigned_vehicle_id, '')) = ''
         AND trim(COALESCE(vr.mission_id, '')) != ''`,
    )
    .all() as Array<Record<string, string | null>>;

  const out: Candidate[] = [];
  for (const row of rows) {
    const kind = classify(row, now);
    if (!kind) continue;
    out.push({
      id: String(row.id),
      organizationId: String(row.organization_id || ""),
      title: label(row.purpose, row.destination, row.departure_date),
      requestorId: String(row.requested_by_id || ""),
      pendingSince: clockStart(row),
      kind,
    });
  }
  return out;
}

/** Null means leave the request alone. */
function classify(row: Record<string, string | null>, now: Date): Candidate["kind"] | null {
  if (!row.mission_id) return "orphan";
  const approval = row.approval_status || "";
  const lifecycle = row.lifecycle_status || "active";
  if (approval === "pending" || approval === "draft" || approval === "") return null;
  if (lifecycle === "deferred") return null;
  if (approval === "approved" && lifecycle === "active") {
    const action = decideStaleAllocation({ now, pendingSince: clockStart(row), warningSentAt: parseDbTime(row.stale_allocation_warned_at) });
    return action === "none" ? null : action;
  }
  return "orphan";
}

function clockStart(row: Record<string, string | null>): Date | null {
  const created = parseDbTime(row.created_at);
  const approved = parseDbTime(row.approved_at);
  if (created && approved) return approved > created ? approved : created;
  return approved || created;
}

interface FleetLead {
  email: string;
  organizationId: string;
}

function fleetLeads(db: Database.Database): FleetLead[] {
  return (
    db
      .prepare(
        `SELECT lower(trim(email)) AS email, IFNULL(organization_id, '') AS organization_id
         FROM users WHERE lower(role) = 'fleet_lead' AND email LIKE '%@%'`,
      )
      .all() as Array<{ email: string; organization_id: string }>
  ).map((row) => ({ email: row.email, organizationId: row.organization_id }));
}

function recipientsFor(db: Database.Database, item: Candidate, leads: FleetLead[]): string[] {
  const emails = new Set<string>();
  const requestor = requestorEmail(db, item.requestorId);
  if (requestor) emails.add(requestor);
  const inOrg = leads.filter((lead) => lead.organizationId === item.organizationId);
  for (const lead of inOrg.length > 0 ? inOrg : leads) emails.add(lead.email);
  return [...emails];
}

function requestorEmail(db: Database.Database, userId: string): string | null {
  const id = userId.trim();
  if (!id) return null;
  if (id.includes("@")) return id.toLowerCase();
  const row = db
    .prepare("SELECT email FROM users WHERE id = ? OR firebase_uid = ?")
    .get(id, id) as { email?: string } | undefined;
  const email = String(row?.email || "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function label(purpose: string | null, destination: string | null, departure: string | null): string {
  const name = String(purpose || "").trim() || String(destination || "").trim() || "Vehicle request";
  const when = String(departure || "").slice(0, 10);
  return when ? `${name} (departs ${when})` : name;
}

function subjectFor(bucket: { warnings: Candidate[]; closures: Candidate[] }): string {
  if (bucket.warnings.length > 0) return "[Fleet Hub] Vehicle requests still need a vehicle";
  return "[Fleet Hub] Vehicle requests cancelled";
}

function digestText(bucket: { warnings: Candidate[]; closures: Candidate[] }, now: Date): string {
  const base = (process.env.FLEET_PUBLIC_BASE_URL || "https://fm.1pwrafrica.com").replace(/\/$/, "");
  const lines = [
    "Fleet Hub cancels vehicle requests that stay unallocated.",
    `A warning is sent after ${ALLOCATION_WARN_AFTER_DAYS} days. The request is cancelled after ${ALLOCATION_CANCEL_AFTER_DAYS} days if it still has no vehicle.`,
    "A request whose mission was already cleared, cancelled, or rejected is cancelled straight away.",
    "",
  ];
  if (bucket.warnings.length > 0) {
    lines.push("These still need a vehicle:");
    for (const item of bucket.warnings) {
      const since = item.pendingSince;
      const days = since ? calendarDaysBetween(since, now) : ALLOCATION_WARN_AFTER_DAYS;
      const cancelOn = since ? addCalendarDays(since, ALLOCATION_CANCEL_AFTER_DAYS) : null;
      const when =
        cancelOn && cancelOn.getTime() <= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
          ? "on the next daily check"
          : `on ${cancelOn ? cancelOn.toISOString().slice(0, 10) : "the next daily check"}`;
      lines.push(`- ${item.title} — waiting ${days} days, cancel ${when}`);
    }
    lines.push("");
  }
  const timedOut = bucket.closures.filter((item) => item.kind === "cancel");
  const orphans = bucket.closures.filter((item) => item.kind === "orphan");
  if (timedOut.length > 0) {
    lines.push(`These were cancelled because no vehicle was allocated within ${ALLOCATION_CANCEL_AFTER_DAYS} days:`);
    for (const item of timedOut) lines.push(`- ${item.title}`);
    lines.push("");
  }
  if (orphans.length > 0) {
    lines.push("These were cancelled because the mission is no longer active:");
    for (const item of orphans) lines.push(`- ${item.title}`);
    lines.push("");
  }
  lines.push(`Allocate vehicles at ${base}/vehicle-requests`);
  return lines.join("\n");
}

function markWarned(db: Database.Database, item: Candidate, nowIso: string): void {
  db.prepare("UPDATE vehicle_requests SET stale_allocation_warned_at = ? WHERE id = ?").run(nowIso, item.id);
  recordMutation(db, {
    entityType: "vehicle_request",
    entityId: item.id,
    organizationId: item.organizationId,
    action: "approval_notify",
    actor: SYSTEM_ACTOR,
    reason: "stale_allocation_warning",
    after: { warnedAt: nowIso, pendingSince: item.pendingSince ? item.pendingSince.toISOString() : null },
  });
}

function cancelRequest(db: Database.Database, item: Candidate, reason: string, nowIso: string): boolean {
  const result = db
    .prepare(
      `UPDATE vehicle_requests
       SET status = 'cancelled', rejection_reason = ?, updated_at = ?
       WHERE id = ? AND lower(status) IN ('requested', 'approved')
         AND trim(COALESCE(assigned_vehicle_id, '')) = ''`,
    )
    .run(reason, nowIso, item.id);
  if (result.changes !== 1) return false;
  recordMutation(db, {
    entityType: "vehicle_request",
    entityId: item.id,
    organizationId: item.organizationId,
    action: "allocation_cancel",
    actor: SYSTEM_ACTOR,
    reason,
    after: { status: "cancelled" },
  });
  return true;
}
