/**
 * Stale work-order nudges (2026-09-17).
 *
 * An open work order that hasn't moved in N days is a repair that's stalling —
 * and usually a sign the record-keeping has stalled with it. This finds them
 * and prompts the fleet team: an email to the assignee, a digest to fleet
 * supervisors, and a WhatsApp digest to the org's fleet group.
 *
 * "Movement" = the latest of: creation, last status change, last progress
 * update, last labour line, last PR/PO link. Terminal statuses
 * (completed/closed/cancelled/rejected) never nudge.
 */
import type Database from "better-sqlite3";
import { sendMail } from "@/lib/mailer";
import { recordMutation } from "@/lib/record-mutation-log";

const SYSTEM_ACTOR = { id: "system", name: "Fleet Hub", role: "", department: "" };

/** Org → fleet-team WhatsApp group (ops bridge broadcast target). */
const FLEET_GROUP_BY_ORG: Record<string, string> = {
  "1pwr_lesotho": "15082456199-1606756999@g.us", // 1PWR LS - Fleet and Logistics
  "1pwr_benin": "120363389953019068@g.us", // 1PWR BN - Fleet
};

export interface StaleWorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string;
  vehicle_code: string;
  last_movement: string;
  days_stale: number;
}

export function findStaleWorkOrders(
  db: Database.Database,
  organizationId: string,
  staleDays: number,
): StaleWorkOrder[] {
  return db
    .prepare(
      `SELECT * FROM (
         SELECT wo.id, wo.work_order_number, wo.title, wo.status, wo.priority,
                wo.assigned_to, v.code AS vehicle_code,
                MAX(
                  datetime(wo.created_at),
                  COALESCE((SELECT MAX(datetime(changed_at)) FROM work_order_status_history h WHERE h.work_order_id = wo.id), '1970-01-01'),
                  COALESCE((SELECT MAX(datetime(u.created_at)) FROM work_order_updates u WHERE u.work_order_id = wo.id), '1970-01-01'),
                  COALESCE((SELECT MAX(datetime(l.created_at)) FROM work_order_labor l WHERE l.work_order_id = wo.id), '1970-01-01'),
                  COALESCE((SELECT MAX(datetime(p.created_at)) FROM work_order_po_links p WHERE p.work_order_id = wo.id), '1970-01-01')
                ) AS last_movement,
                CAST(julianday('now') - julianday(
                  MAX(
                    datetime(wo.created_at),
                    COALESCE((SELECT MAX(datetime(changed_at)) FROM work_order_status_history h WHERE h.work_order_id = wo.id), '1970-01-01'),
                    COALESCE((SELECT MAX(datetime(u.created_at)) FROM work_order_updates u WHERE u.work_order_id = wo.id), '1970-01-01'),
                    COALESCE((SELECT MAX(datetime(l.created_at)) FROM work_order_labor l WHERE l.work_order_id = wo.id), '1970-01-01'),
                    COALESCE((SELECT MAX(datetime(p.created_at)) FROM work_order_po_links p WHERE p.work_order_id = wo.id), '1970-01-01')
                  )
                ) AS INTEGER) AS days_stale
         FROM work_orders wo
         JOIN vehicles v ON wo.vehicle_id = v.id
         WHERE wo.organization_id = ?
           AND wo.status NOT IN ('completed', 'closed', 'cancelled', 'rejected')
       )
       WHERE days_stale >= ?
       ORDER BY days_stale DESC, priority ASC`,
    )
    .all(organizationId, staleDays) as StaleWorkOrder[];
}

interface MechanicRow {
  display_name: string;
  email: string;
  mechanic_role: string;
}

function fleetRecipients(
  db: Database.Database,
  organizationId: string,
): { byAssignee: Map<string, string>; supervisors: string[] } {
  const rows = db
    .prepare(
      `SELECT display_name, email, mechanic_role FROM fleet_mechanics
       WHERE organization_id = ? AND status = 'active' AND email != ''`,
    )
    .all(organizationId) as MechanicRow[];
  const byAssignee = new Map<string, string>();
  const supervisors: string[] = [];
  for (const r of rows) {
    byAssignee.set(r.display_name.trim().toLowerCase(), r.email.trim().toLowerCase());
    if (r.mechanic_role === "supervisor" || r.mechanic_role === "trainer") {
      supervisors.push(r.email.trim().toLowerCase());
    }
  }
  return { byAssignee, supervisors };
}

async function postFleetWhatsApp(text: string, organizationId: string): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const url = (process.env.WA_BRIDGE_URL || "").replace(/\/$/, "");
  const secret = process.env.WA_BRIDGE_SECRET || "";
  const jid = FLEET_GROUP_BY_ORG[organizationId] || "";
  if (!url || !secret) return { ok: false, skipped: "WA bridge not configured" };
  if (!jid) return { ok: false, skipped: `no fleet group mapped for ${organizationId}` };
  try {
    const res = await fetch(`${url}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Secret": secret },
      body: JSON.stringify({ jid, text }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `bridge ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface StaleWoNudgeResult {
  organizationId: string;
  staleDays: number;
  staleCount: number;
  emailedAssignees: string[];
  emailedSupervisors: string[];
  whatsapp: { ok: boolean; error?: string; skipped?: string };
}

export async function runStaleWoNudge(
  db: Database.Database,
  organizationId: string,
  staleDays: number,
): Promise<StaleWoNudgeResult> {
  const stale = findStaleWorkOrders(db, organizationId, staleDays);
  const result: StaleWoNudgeResult = {
    organizationId,
    staleDays,
    staleCount: stale.length,
    emailedAssignees: [],
    emailedSupervisors: [],
    whatsapp: { ok: false, skipped: "no stale WOs" },
  };
  if (stale.length === 0) {
    recordMutation(db, {
      entityType: "work_order",
      entityId: `stale-nudge-${organizationId}`,
      organizationId,
      action: "stale_wo_nudge",
      actor: SYSTEM_ACTOR,
      after: { staleCount: 0, staleDays },
    });
    return result;
  }

  const { byAssignee, supervisors } = fleetRecipients(db, organizationId);
  const baseUrl = (process.env.FLEET_PUBLIC_BASE_URL || "https://fm.1pwrafrica.com").replace(/\/$/, "");

  const lineFor = (wo: StaleWorkOrder) =>
    `• ${wo.work_order_number || "WO"} · ${wo.vehicle_code} · ${wo.title} — ${wo.status}, ${wo.days_stale}d without movement${wo.assigned_to ? ` (${wo.assigned_to})` : ""}`;

  // Per-assignee emails (only their WOs)
  const byAssigneeEmail = new Map<string, StaleWorkOrder[]>();
  for (const wo of stale) {
    const email = byAssignee.get((wo.assigned_to || "").trim().toLowerCase());
    if (!email) continue;
    const list = byAssigneeEmail.get(email) || [];
    list.push(wo);
    byAssigneeEmail.set(email, list);
  }
  for (const [email, wos] of byAssigneeEmail) {
    const text = [
      `You have ${wos.length} open work order${wos.length === 1 ? "" : "s"} with no movement in ${staleDays}+ days:`,
      "",
      ...wos.map(lineFor),
      "",
      "Please post a progress update, log labour, or advance the status in Fleet Hub:",
      `${baseUrl}/work-orders`,
      "",
      "Keeping the record current is what lets us rank vehicles by effort and cost — and catch stalled repairs before they strand a crew.",
    ].join("\n");
    const r = await sendMail({
      to: [email],
      subject: `[Fleet Hub] ${wos.length} stalled work order${wos.length === 1 ? "" : "s"} need an update`,
      text,
    });
    if (r.ok) result.emailedAssignees.push(email);
  }

  // Supervisor digest
  if (supervisors.length > 0) {
    const text = [
      `${stale.length} open work order${stale.length === 1 ? "" : "s"} with no movement in ${staleDays}+ days (${organizationId}):`,
      "",
      ...stale.map(lineFor),
      "",
      `Review: ${baseUrl}/work-orders`,
    ].join("\n");
    const r = await sendMail({
      to: supervisors,
      subject: `[Fleet Hub] ${stale.length} stalled work order${stale.length === 1 ? "" : "s"} — fleet digest`,
      text,
    });
    if (r.ok) result.emailedSupervisors = supervisors;
  }

  // WhatsApp digest to the fleet group
  const waText = [
    `*Fleet Hub — stalled work orders* (${stale.length} open, no movement in ${staleDays}+ days)`,
    "",
    ...stale.slice(0, 10).map(lineFor),
    ...(stale.length > 10 ? [`…and ${stale.length - 10} more`] : []),
    "",
    `Review: ${baseUrl}/work-orders`,
  ].join("\n");
  result.whatsapp = await postFleetWhatsApp(waText, organizationId);

  recordMutation(db, {
    entityType: "work_order",
    entityId: `stale-nudge-${organizationId}`,
    organizationId,
    action: "stale_wo_nudge",
    actor: SYSTEM_ACTOR,
    after: {
      staleCount: stale.length,
      staleDays,
      staleWoIds: stale.map((w) => w.id),
      emailedAssignees: result.emailedAssignees,
      emailedSupervisors: result.emailedSupervisors,
      whatsapp: result.whatsapp,
    },
  });

  return result;
}
