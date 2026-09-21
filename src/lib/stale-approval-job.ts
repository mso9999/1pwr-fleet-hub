/**
 * Daily pass: warn when a mission or standalone vehicle request has been
 * waiting for approval for 20 days, and reject it at 30 days if that warning
 * was already sent.
 */
import type Database from "better-sqlite3";
import { fetchHrEmployeeDirectory, type HrDirectoryEmployee } from "@/lib/hr-directory-client";
import { countryFromOrganization } from "@/lib/hr-approval-roles";
import { sendMail, type MailResult } from "@/lib/mailer";
import { recordMutation } from "@/lib/record-mutation-log";
import {
  REJECT_AFTER_DAYS,
  WARN_AFTER_DAYS,
  addCalendarDays,
  calendarDaysBetween,
  decideStaleApproval,
  parseDbTime,
} from "@/lib/stale-approval";

const SYSTEM_ACTOR = { id: "system", name: "Fleet Hub", role: "", department: "" };
const REJECT_REASON = `Automatically rejected: still unapproved ${REJECT_AFTER_DAYS} days after it was submitted.`;

export interface StaleApprovalSummary {
  warned: number;
  rejected: number;
  emailsSent: number;
  emailFailures: number;
}

interface Candidate {
  kind: "mission" | "vehicle_request";
  id: string;
  organizationId: string;
  title: string;
  pendingSince: Date;
  warningSentAt: Date | null;
  requestorId: string;
  hrRequestId: string;
}

type SendMailFn = (message: { to: string[]; subject: string; text: string }) => Promise<MailResult>;

export async function runStaleApprovalTimeout(
  db: Database.Database,
  opts?: { now?: Date; sendMail?: SendMailFn; directory?: HrDirectoryEmployee[] | null },
): Promise<StaleApprovalSummary> {
  const now = opts?.now ?? new Date();
  const mail = opts?.sendMail ?? sendMail;
  const directory = opts?.directory !== undefined ? opts.directory : await loadDirectory();
  const candidates = loadCandidates(db);
  const summary: StaleApprovalSummary = { warned: 0, rejected: 0, emailsSent: 0, emailFailures: 0 };

  type Bucket = { warnings: Candidate[]; rejections: Candidate[] };
  const byRecipient = new Map<string, Bucket>();
  const warnOk = new Set<string>();

  for (const item of candidates) {
    const action = decideStaleApproval({ now, pendingSince: item.pendingSince, warningSentAt: item.warningSentAt });
    if (action === "none") continue;
    const recipients = recipientsFor(db, item, directory);
    if (action === "warn" && recipients.length === 0) continue;
    for (const email of recipients) {
      const bucket = byRecipient.get(email) ?? { warnings: [], rejections: [] };
      if (action === "warn") bucket.warnings.push(item);
      else bucket.rejections.push(item);
      byRecipient.set(email, bucket);
    }
    if (action === "reject") summary.rejected += 1;
  }

  for (const [email, bucket] of byRecipient) {
    if (bucket.warnings.length === 0 && bucket.rejections.length === 0) continue;
    const result = await mail({
      to: [email],
      subject: "[Fleet Hub] Unapproved requests will be rejected",
      text: digestText(bucket, now),
    });
    if (result.ok) {
      summary.emailsSent += 1;
      for (const item of bucket.warnings) warnOk.add(itemKey(item));
    } else {
      summary.emailFailures += 1;
    }
  }

  const warnedAt = now.toISOString();
  for (const item of candidates) {
    const action = decideStaleApproval({ now, pendingSince: item.pendingSince, warningSentAt: item.warningSentAt });
    if (action === "warn" && warnOk.has(itemKey(item))) {
      markWarned(db, item, warnedAt);
      summary.warned += 1;
    } else if (action === "reject") {
      rejectItem(db, item, warnedAt);
    }
  }

  return summary;
}

function itemKey(item: Candidate): string {
  return `${item.kind}:${item.id}`;
}

function loadDirectory(): Promise<HrDirectoryEmployee[] | null> {
  return fetchHrEmployeeDirectory().then((result) => (result.ok && result.employees ? result.employees : null));
}

function loadCandidates(db: Database.Database): Candidate[] {
  const missions = db
    .prepare(
      `SELECT m.id, m.organization_id, m.title, m.destination, m.departure_date,
              m.created_by_id, m.created_at, m.stale_approval_warned_at, m.hr_request_id,
              (
                SELECT MAX(l.created_at) FROM record_mutation_log l
                WHERE l.entity_type = 'mission' AND l.entity_id = m.id
                  AND l.reason IN ('draft_submitted_for_approval', 'resubmitted_for_approval')
              ) AS submitted_at
       FROM missions m
       WHERE lower(COALESCE(m.approval_status, '')) = 'pending'
         AND lower(COALESCE(m.lifecycle_status, 'active')) = 'active'`,
    )
    .all() as Array<Record<string, string | null>>;

  const requests = db
    .prepare(
      `SELECT vr.id, vr.organization_id, vr.purpose, vr.destination, vr.departure_date,
              vr.requested_by_id, vr.created_at, vr.stale_approval_warned_at
       FROM vehicle_requests vr
       LEFT JOIN missions m ON m.id = vr.mission_id
       WHERE lower(COALESCE(vr.status, '')) = 'requested'
         AND (vr.mission_id IS NULL OR trim(vr.mission_id) = '' OR m.id IS NULL)`,
    )
    .all() as Array<Record<string, string | null>>;

  const out: Candidate[] = [];
  for (const row of missions) {
    const pendingSince = parseDbTime(row.submitted_at) || parseDbTime(row.created_at);
    if (!pendingSince) continue;
    out.push({
      kind: "mission",
      id: String(row.id),
      organizationId: String(row.organization_id || ""),
      title: label(row.title, row.destination, row.departure_date),
      pendingSince,
      warningSentAt: parseDbTime(row.stale_approval_warned_at),
      requestorId: String(row.created_by_id || ""),
      hrRequestId: String(row.hr_request_id || ""),
    });
  }
  for (const row of requests) {
    const pendingSince = parseDbTime(row.created_at);
    if (!pendingSince) continue;
    out.push({
      kind: "vehicle_request",
      id: String(row.id),
      organizationId: String(row.organization_id || ""),
      title: label(row.purpose, row.destination, row.departure_date),
      pendingSince,
      warningSentAt: parseDbTime(row.stale_approval_warned_at),
      requestorId: String(row.requested_by_id || ""),
      hrRequestId: "",
    });
  }
  return out;
}

function label(title: string | null, destination: string | null, departure: string | null): string {
  const name = String(title || "").trim() || String(destination || "").trim() || "Request";
  const when = String(departure || "").slice(0, 10);
  return when ? `${name} (departs ${when})` : name;
}

function recipientsFor(
  db: Database.Database,
  item: Candidate,
  directory: HrDirectoryEmployee[] | null,
): string[] {
  const emails = new Set<string>();
  const requestor = requestorEmail(db, item.requestorId);
  if (requestor) emails.add(requestor);
  if (directory) {
    const country = countryFromOrganization(db, item.organizationId);
    const upper = country ? country.toUpperCase() : null;
    for (const emp of directory) {
      if (!emp.email || (emp.status || "").toLowerCase() === "inactive") continue;
      const approves = (emp.toolset_approvals ?? []).some((grant) => {
        if (grant.toolset !== "fm" || grant.approval_role !== "mission_approver") return false;
        if (!grant.scope_country_code) return true;
        return upper !== null && grant.scope_country_code.toUpperCase() === upper;
      });
      if (approves) emails.add(emp.email.trim().toLowerCase());
    }
  }
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

function digestText(bucket: { warnings: Candidate[]; rejections: Candidate[] }, now: Date): string {
  const base = (process.env.FLEET_PUBLIC_BASE_URL || "https://fm.1pwrafrica.com").replace(/\/$/, "");
  const lines = [
    "Fleet Hub closes requests that stay unapproved.",
    `A warning is sent after ${WARN_AFTER_DAYS} days. The request is rejected after ${REJECT_AFTER_DAYS} days if it is still waiting.`,
    "",
  ];
  if (bucket.warnings.length > 0) {
    lines.push("These will be rejected if they are not approved in time:");
    for (const item of bucket.warnings) {
      const days = calendarDaysBetween(item.pendingSince, now);
      const rejectOn = addCalendarDays(item.pendingSince, REJECT_AFTER_DAYS);
      const when = rejectOn.getTime() <= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        ? "on the next daily check"
        : `on ${rejectOn.toISOString().slice(0, 10)}`;
      lines.push(`- ${item.title} — waiting ${days} days, reject ${when}`);
    }
    lines.push("");
  }
  if (bucket.rejections.length > 0) {
    lines.push("These were rejected because they were still unapproved after 30 days:");
    for (const item of bucket.rejections) lines.push(`- ${item.title}`);
    lines.push("");
  }
  lines.push(`Review them at ${base}/vehicle-requests`);
  return lines.join("\n");
}

function markWarned(db: Database.Database, item: Candidate, warnedAt: string): void {
  const table = item.kind === "mission" ? "missions" : "vehicle_requests";
  db.prepare(`UPDATE ${table} SET stale_approval_warned_at = ? WHERE id = ?`).run(warnedAt, item.id);
  recordMutation(db, {
    entityType: item.kind,
    entityId: item.id,
    organizationId: item.organizationId,
    action: "approval_notify",
    actor: SYSTEM_ACTOR,
    reason: "stale_approval_warning",
    after: { warnedAt, pendingSince: item.pendingSince.toISOString() },
  });
}

function rejectItem(db: Database.Database, item: Candidate, nowIso: string): void {
  if (item.kind === "mission") {
    db.prepare(
      `UPDATE missions
       SET approval_status = 'rejected', approved_by_id = 'system', approved_by_name = 'Fleet Hub',
           approved_at = ?, rejection_reason = ?, updated_at = ?
       WHERE id = ? AND lower(COALESCE(approval_status, '')) = 'pending'`,
    ).run(nowIso, REJECT_REASON, nowIso, item.id);
    db.prepare(
      `UPDATE vehicle_requests
       SET status = 'rejected', approved_by_id = 'system', approved_by_name = 'Fleet Hub',
           rejection_reason = ?, updated_at = ?
       WHERE mission_id = ? AND lower(COALESCE(status, '')) = 'requested'`,
    ).run(REJECT_REASON, nowIso, item.id);
    if (item.hrRequestId) void syncRejectedToHr(item, nowIso);
  } else {
    db.prepare(
      `UPDATE vehicle_requests
       SET status = 'rejected', approved_by_id = 'system', approved_by_name = 'Fleet Hub',
           rejection_reason = ?, updated_at = ?
       WHERE id = ? AND lower(COALESCE(status, '')) = 'requested'`,
    ).run(REJECT_REASON, nowIso, item.id);
  }
  recordMutation(db, {
    entityType: item.kind,
    entityId: item.id,
    organizationId: item.organizationId,
    action: "reject",
    actor: SYSTEM_ACTOR,
    reason: REJECT_REASON,
    after: { approval_status: "rejected", rejection_reason: REJECT_REASON },
  });
}

async function syncRejectedToHr(item: Candidate, nowIso: string): Promise<void> {
  const base = (process.env.HR_API_BASE_URL || "").replace(/\/$/, "");
  const key = process.env.HR_API_KEY || "";
  if (!base || !key) return;
  try {
    const res = await fetch(`${base}/api/per-diem/requests/${encodeURIComponent(item.hrRequestId)}/status-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: JSON.stringify({
        status: "Rejected",
        remarks: REJECT_REASON,
        action_at: nowIso,
        source: "fleet_hub",
        fleet_mission_id: item.id,
      }),
    });
    if (!res.ok && res.status !== 409) {
      console.error("[stale-approval] HR sync failed", item.id, res.status);
    }
  } catch (err) {
    console.error("[stale-approval] HR sync error", item.id, err);
  }
}
