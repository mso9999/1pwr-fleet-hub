/**
 * Notify FM mission approvers when a mission enters `pending`.
 *
 * Triggered from the mission create / submit / resubmit routes. Resolves the
 * approver cohort from the HR directory (canonical fm:mission_approver grants,
 * global or country-scoped to the mission's organization) and emails them with
 * the mission summary and a review link.
 *
 * Every attempt — sent, skipped, or failed — is written to the mutation log
 * (action `approval_notify`) so "were approvers notified?" is answerable from
 * the audit trail instead of guesswork.
 *
 * Best-effort by design: notification failures never block the mission write.
 */
import type Database from "better-sqlite3";
import { fetchHrEmployeeDirectory } from "@/lib/hr-directory-client";
import { countryFromOrganization } from "@/lib/hr-approval-roles";
import { sendMail } from "@/lib/mailer";
import { recordMutation } from "@/lib/record-mutation-log";

const SYSTEM_ACTOR = { id: "system", name: "Fleet Hub", role: "", department: "" };

export type ApprovalNotifyTrigger = "create" | "submit" | "resubmit" | "backfill";

export interface WhatsAppNotifyResult {
  ok: boolean;
  skipped?: string;
  error?: string;
}

export interface ApprovalNotifyOutcome {
  ok: boolean;
  recipients: string[];
  skipped?: string;
  error?: string;
  whatsapp?: WhatsAppNotifyResult;
}

/**
 * Post the approval notice to the ops WhatsApp group via the CC bridge
 * (Baileys on the CC host, exposed to the fleet EC2 only through Caddy).
 * Env: WA_BRIDGE_URL (e.g. https://cc.1pwrafrica.com/bridge),
 * WA_BRIDGE_SECRET (shared bridge secret), WA_BRIDGE_GROUP_JID (target group).
 * Any missing piece skips cleanly and is audit-logged.
 */
async function sendWhatsAppApprovalNotice(text: string): Promise<WhatsAppNotifyResult> {
  const url = (process.env.WA_BRIDGE_URL || "").replace(/\/$/, "");
  const secret = process.env.WA_BRIDGE_SECRET || "";
  const jid = (process.env.WA_BRIDGE_GROUP_JID || "").trim();
  if (!url || !secret) return { ok: false, skipped: "WA_BRIDGE_URL/SECRET not configured" };
  if (!jid) return { ok: false, skipped: "WA_BRIDGE_GROUP_JID not configured" };
  try {
    const res = await fetch(`${url}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Secret": secret },
      body: JSON.stringify({ jid, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 120);
      return { ok: false, error: `bridge ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface MissionRow {
  id: string;
  organization_id: string;
  title: string;
  destination: string;
  departure_location: string;
  departure_date: string;
  return_date: string;
  approval_status: string;
  crew_size: number;
  mission_profile: string;
  required_vehicle_class: string;
  transport_mode: string;
  created_by_name: string;
}

/**
 * Emails the fm:mission_approver cohort for the mission's country when the
 * mission is pending. Safe to call multiple times for the same mission —
 * callers dedupe via the mutation log when they need exactly-once.
 */
export async function notifyMissionApproversOfSubmission(
  db: Database.Database,
  missionId: string,
  trigger: ApprovalNotifyTrigger,
): Promise<ApprovalNotifyOutcome> {
  const mission = db
    .prepare("SELECT * FROM missions WHERE id = ?")
    .get(missionId) as MissionRow | undefined;

  const log = (outcome: ApprovalNotifyOutcome) => {
    recordMutation(db, {
      entityType: "mission",
      entityId: missionId,
      organizationId: mission?.organization_id || "",
      action: "approval_notify",
      actor: SYSTEM_ACTOR,
      after: {
        trigger,
        ok: outcome.ok,
        recipients: outcome.recipients,
        ...(outcome.skipped ? { skipped: outcome.skipped } : {}),
        ...(outcome.error ? { error: outcome.error } : {}),
        ...(outcome.whatsapp ? { whatsapp: outcome.whatsapp } : {}),
      },
    });
  };

  if (!mission) {
    const outcome: ApprovalNotifyOutcome = { ok: false, recipients: [], error: "mission not found" };
    return outcome;
  }
  if (String(mission.approval_status || "").toLowerCase() !== "pending") {
    const outcome: ApprovalNotifyOutcome = {
      ok: false,
      recipients: [],
      skipped: `approval_status=${mission.approval_status}`,
    };
    log(outcome);
    return outcome;
  }
  const country = countryFromOrganization(db, mission.organization_id);
  const directory = await fetchHrEmployeeDirectory();
  if (!directory.ok || !directory.employees) {
    const outcome: ApprovalNotifyOutcome = {
      ok: false,
      recipients: [],
      error: `HR directory unavailable: ${directory.error || "unknown"}`,
    };
    log(outcome);
    return outcome;
  }

  const upperCountry = country ? country.toUpperCase() : null;
  const recipients = [
    ...new Set(
      directory.employees
        .filter((emp) => {
          if (!emp.email) return false;
          if ((emp.status || "").toLowerCase() === "inactive") return false;
          return (emp.toolset_approvals ?? []).some((a) => {
            if (a.toolset !== "fm" || a.approval_role !== "mission_approver") return false;
            if (!a.scope_country_code) return true;
            return upperCountry !== null && a.scope_country_code.toUpperCase() === upperCountry;
          });
        })
        .map((emp) => emp.email.trim().toLowerCase()),
    ),
  ].sort();

  if (recipients.length === 0) {
    const outcome: ApprovalNotifyOutcome = {
      ok: false,
      recipients: [],
      error: `no fm:mission_approver grants found for country ${upperCountry ?? "?"}`,
    };
    log(outcome);
    return outcome;
  }

  const baseUrl = (process.env.FLEET_PUBLIC_BASE_URL || "https://fm.1pwrafrica.com").replace(/\/$/, "");
  const reviewUrl = `${baseUrl}/vehicle-requests`;
  const stops = (
    db
      .prepare("SELECT location FROM mission_stops WHERE mission_id = ? ORDER BY stop_order")
      .all(missionId) as Array<{ location: string }>
  ).map((s) => String(s.location));
  const route = [mission.departure_location || "HQ", ...stops, mission.destination]
    .filter(Boolean)
    .join(" → ");
  const title = mission.title.trim() || `Mission to ${mission.destination}`;

  const subject = `[Fleet Hub] Approval needed: ${title} — departs ${mission.departure_date}`;
  const lines = [
    `A mission was submitted for approval${trigger === "resubmit" ? " (resubmitted after revision)" : ""}.`,
    ``,
    `Mission:      ${title}`,
    `Route:        ${route}`,
    `Departure:    ${mission.departure_date}    Return: ${mission.return_date || "—"}`,
    `Requested by: ${mission.created_by_name}`,
    `Crew:         ${mission.crew_size}`,
    `Profile:      ${mission.mission_profile}    Vehicle class: ${mission.required_vehicle_class || "any"}    Mode: ${mission.transport_mode}`,
    ``,
    `Review and approve here: ${reviewUrl}`,
    ``,
    `You are receiving this because you hold an FM mission-approver grant${upperCountry ? ` (${upperCountry} or global scope)` : ""} in the HR directory.`,
  ];
  const text = lines.join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `
    <p>A mission was submitted for approval${trigger === "resubmit" ? " (resubmitted after revision)" : ""}.</p>
    <table cellpadding="4" style="border-collapse:collapse">
      <tr><td><b>Mission</b></td><td>${esc(title)}</td></tr>
      <tr><td><b>Route</b></td><td>${esc(route)}</td></tr>
      <tr><td><b>Departure</b></td><td>${esc(mission.departure_date)}</td></tr>
      <tr><td><b>Return</b></td><td>${esc(mission.return_date || "—")}</td></tr>
      <tr><td><b>Requested by</b></td><td>${esc(mission.created_by_name)}</td></tr>
      <tr><td><b>Crew</b></td><td>${mission.crew_size}</td></tr>
      <tr><td><b>Profile</b></td><td>${esc(mission.mission_profile)}</td></tr>
      <tr><td><b>Vehicle class</b></td><td>${esc(mission.required_vehicle_class || "any")}</td></tr>
      <tr><td><b>Mode</b></td><td>${esc(mission.transport_mode)}</td></tr>
    </table>
    <p><a href="${reviewUrl}">Review and approve in Fleet Hub</a></p>
    <p style="color:#666;font-size:12px">You are receiving this because you hold an FM mission-approver grant${upperCountry ? ` (${upperCountry} or global scope)` : ""} in the HR directory.</p>
  `;

  const result = await sendMail({ to: recipients, subject, text, html });

  const waLines = [
    `*Fleet Hub — mission approval needed*${trigger === "resubmit" ? " (resubmitted)" : ""}`,
    `*Mission:* ${title}`,
    `*Route:* ${route}`,
    `*Departs:* ${mission.departure_date} → ${mission.return_date || "—"}`,
    `*By:* ${mission.created_by_name} · ${mission.crew_size} pax · ${mission.required_vehicle_class || "any class"}`,
    `Review: ${reviewUrl}`,
  ];
  const whatsapp = await sendWhatsAppApprovalNotice(waLines.join("\n"));

  const outcome: ApprovalNotifyOutcome = result.ok
    ? { ok: true, recipients, whatsapp }
    : { ok: false, recipients, error: result.error, whatsapp };
  log(outcome);
  return outcome;
}
