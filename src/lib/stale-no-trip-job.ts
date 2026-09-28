/**
 * Daily pass: approved company-vehicle missions with no planned trip get
 * escalating reminders to the requestor (7, 3 and 1 day left) and are expired
 * (lifecycle_status = 'expired_no_trip') 14 days after approval.
 */
import type Database from "better-sqlite3";
import { sendMail, type MailResult } from "@/lib/mailer";
import { recordMutation } from "@/lib/record-mutation-log";
import { addCalendarDays, parseDbTime } from "@/lib/stale-approval";
import { NO_TRIP_EXPIRE_AFTER_DAYS, decideNoTrip, type NoTripAction } from "@/lib/stale-no-trip";

const SYSTEM_ACTOR = { id: "system", name: "Fleet Hub", role: "", department: "" };
export const NO_TRIP_EXPIRE_REASON = `Automatically cleared: approved but no trip was created within ${NO_TRIP_EXPIRE_AFTER_DAYS} days.`;

export interface StaleNoTripSummary {
  warned: number;
  expired: number;
  emailsSent: number;
  emailFailures: number;
}

interface Candidate {
  id: string;
  organizationId: string;
  title: string;
  requestorId: string;
  since: Date;
  action: NoTripAction;
}

type SendMailFn = (message: { to: string[]; subject: string; text: string }) => Promise<MailResult>;

export async function runStaleNoTripCleanup(
  db: Database.Database,
  opts?: { now?: Date; sendMail?: SendMailFn },
): Promise<StaleNoTripSummary> {
  const now = opts?.now ?? new Date();
  const mail = opts?.sendMail ?? sendMail;
  const summary: StaleNoTripSummary = { warned: 0, expired: 0, emailsSent: 0, emailFailures: 0 };
  const candidates = loadCandidates(db, now).filter((c) => c.action.kind !== "none");

  const byRecipient = new Map<string, Candidate[]>();
  for (const item of candidates) {
    const email = requestorEmail(db, item.requestorId);
    if (!email) {
      if (item.action.kind === "expire") {
        expireMission(db, item, now.toISOString());
        summary.expired += 1;
      }
      continue;
    }
    const list = byRecipient.get(email) ?? [];
    list.push(item);
    byRecipient.set(email, list);
  }

  const nowIso = now.toISOString();
  for (const [email, items] of byRecipient) {
    const result = await mail({ to: [email], subject: subjectFor(items), text: digestText(items, now) });
    if (result.ok) summary.emailsSent += 1;
    else summary.emailFailures += 1;
    for (const item of items) {
      if (item.action.kind === "warn" && result.ok) {
        markWarned(db, item, item.action.stage, nowIso);
        summary.warned += 1;
      } else if (item.action.kind === "expire") {
        expireMission(db, item, nowIso);
        summary.expired += 1;
      }
    }
  }
  return summary;
}

function loadCandidates(db: Database.Database, now: Date): Candidate[] {
  const rows = db
    .prepare(
      `SELECT m.id, m.organization_id, m.title, m.destination, m.departure_date, m.created_by_id,
              m.approved_at, m.no_trip_warned_at, m.no_trip_warn_stage,
              (
                SELECT MAX(l.created_at) FROM record_mutation_log l
                WHERE l.entity_type = 'mission' AND l.entity_id = m.id
                  AND l.action = 'mission_lifecycle' AND l.after_json LIKE '%"subAction":"reactivate"%'
              ) AS reactivated_at
       FROM missions m
       WHERE lower(COALESCE(m.approval_status, '')) = 'approved'
         AND lower(COALESCE(m.lifecycle_status, 'active')) = 'active'
         AND lower(COALESCE(m.status, 'planned')) = 'planned'
         AND trim(COALESCE(m.trip_id, '')) = ''
         AND lower(COALESCE(NULLIF(trim(m.transport_mode), ''), 'company_vehicle')) = 'company_vehicle'`,
    )
    .all() as Array<Record<string, string | number | null>>;

  const out: Candidate[] = [];
  for (const row of rows) {
    const approved = parseDbTime(row.approved_at as string | null);
    const reactivated = parseDbTime(row.reactivated_at as string | null);
    const since =
      approved && reactivated ? (reactivated > approved ? reactivated : approved) : approved || reactivated;
    if (!since) continue;
    out.push({
      id: String(row.id),
      organizationId: String(row.organization_id || ""),
      title: label(row.title as string, row.destination as string, row.departure_date as string),
      requestorId: String(row.created_by_id || ""),
      since,
      action: decideNoTrip({
        now,
        since,
        warnedStage: Number(row.no_trip_warn_stage) || 0,
        warnedAt: parseDbTime(row.no_trip_warned_at as string | null),
      }),
    });
  }
  return out;
}

function label(title: string | null, destination: string | null, departure: string | null): string {
  const name = String(title || "").trim() || String(destination || "").trim() || "Mission";
  const when = String(departure || "").slice(0, 10);
  return when ? `${name} (departs ${when})` : name;
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

function subjectFor(items: Candidate[]): string {
  const warns = items.filter((i) => i.action.kind === "warn") as Array<Candidate & { action: { kind: "warn"; daysLeft: number } }>;
  if (warns.length === 0) return "[Fleet Hub] Approved missions cleared: no trip was created";
  const minLeft = Math.min(...warns.map((w) => w.action.daysLeft));
  if (minLeft <= 1) return "[Fleet Hub] FINAL NOTICE: create the trip or your approved mission is cleared";
  if (minLeft <= 3) return `[Fleet Hub] ${minLeft} days left to create the trip for your approved mission`;
  return "[Fleet Hub] Reminder: create the trip for your approved mission";
}

function digestText(items: Candidate[], now: Date): string {
  const base = (process.env.FLEET_PUBLIC_BASE_URL || "https://fm.1pwrafrica.com").replace(/\/$/, "");
  const lines = [
    `An approved mission needs a planned trip. Missions with no trip ${NO_TRIP_EXPIRE_AFTER_DAYS} days after approval are cleared.`,
    "",
  ];
  const warns = items.filter((i) => i.action.kind === "warn");
  const expired = items.filter((i) => i.action.kind === "expire");
  if (warns.length > 0) {
    lines.push("Create the trip on Trips for these missions:");
    for (const item of warns) {
      const left = item.action.kind === "warn" ? item.action.daysLeft : 0;
      const clearOn = addCalendarDays(item.since, NO_TRIP_EXPIRE_AFTER_DAYS);
      const when =
        left <= 0 || clearOn.getTime() <= now.getTime()
          ? "on the next daily check"
          : `on ${clearOn.toISOString().slice(0, 10)} (${left} day${left === 1 ? "" : "s"} left)`;
      lines.push(`- ${item.title} — cleared ${when}`);
    }
    lines.push("");
  }
  if (expired.length > 0) {
    lines.push("These were cleared because no trip was created. Submit a new mission if the trip is still needed:");
    for (const item of expired) lines.push(`- ${item.title}`);
    lines.push("");
  }
  lines.push(`Create the trip at ${base}/trips`);
  lines.push(`See your missions at ${base}/vehicle-requests`);
  return lines.join("\n");
}

function markWarned(db: Database.Database, item: Candidate, stage: number, nowIso: string): void {
  db.prepare("UPDATE missions SET no_trip_warn_stage = ?, no_trip_warned_at = ? WHERE id = ?").run(
    stage,
    nowIso,
    item.id,
  );
  recordMutation(db, {
    entityType: "mission",
    entityId: item.id,
    organizationId: item.organizationId,
    action: "approval_notify",
    actor: SYSTEM_ACTOR,
    reason: "no_trip_warning",
    after: { stage, warnedAt: nowIso, since: item.since.toISOString() },
  });
}

function expireMission(db: Database.Database, item: Candidate, nowIso: string): void {
  db.prepare(
    `UPDATE missions
     SET lifecycle_status = 'expired_no_trip', rejection_reason = ?, updated_at = ?
     WHERE id = ? AND lower(COALESCE(lifecycle_status, 'active')) = 'active' AND trim(COALESCE(trip_id, '')) = ''`,
  ).run(NO_TRIP_EXPIRE_REASON, nowIso, item.id);
  recordMutation(db, {
    entityType: "mission",
    entityId: item.id,
    organizationId: item.organizationId,
    action: "mission_lifecycle",
    actor: SYSTEM_ACTOR,
    reason: NO_TRIP_EXPIRE_REASON,
    after: { subAction: "expire_no_trip", lifecycle_status: "expired_no_trip" },
  });
}
