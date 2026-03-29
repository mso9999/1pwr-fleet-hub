import type Database from "better-sqlite3";

export interface DailyUpdateItem {
  workOrderId: string;
  vehicleCode: string;
  vehicleMake: string;
  vehicleModel: string;
  title: string;
  status: string;
  repairLocation: string;
  assignedTo: string;
  lines: string[];
}

export interface DailyUpdateResult {
  date: string;
  headline: string;
  markdown: string;
  plainText: string;
  items: DailyUpdateItem[];
}

function padHeading(dateIso: string): string {
  const d = new Date(dateIso + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Build a WhatsApp-style daily summary from work order activity on a calendar day (org timezone: use UTC date string YYYY-MM-DD).
 */
export function buildDailyUpdate(
  db: Database.Database,
  organizationId: string,
  dateIso: string
): DailyUpdateResult {
  const dayStart = `${dateIso}T00:00:00.000Z`;
  const dayEnd = `${dateIso}T23:59:59.999Z`;

  const touchedIds = new Set<string>();

  const updates = db
    .prepare(
      `
    SELECT wou.work_order_id, wou.note, wou.posted_by_name, wou.created_at
    FROM work_order_updates wou
    JOIN work_orders wo ON wou.work_order_id = wo.id
    WHERE wo.organization_id = ?
      AND wou.created_at >= ? AND wou.created_at <= ?
    ORDER BY wou.created_at ASC
  `
    )
    .all(organizationId, dayStart, dayEnd) as Array<{
    work_order_id: string;
    note: string;
    posted_by_name: string;
    created_at: string;
  }>;

  for (const u of updates) touchedIds.add(u.work_order_id);

  const history = db
    .prepare(
      `
    SELECT wosh.work_order_id, wosh.from_status, wosh.to_status, wosh.changed_by_name, wosh.reason, wosh.changed_at
    FROM work_order_status_history wosh
    JOIN work_orders wo ON wosh.work_order_id = wo.id
    WHERE wo.organization_id = ?
      AND wosh.changed_at >= ? AND wosh.changed_at <= ?
    ORDER BY wosh.changed_at ASC
  `
    )
    .all(organizationId, dayStart, dayEnd) as Array<{
    work_order_id: string;
    from_status: string | null;
    to_status: string;
    changed_by_name: string;
    reason: string;
    changed_at: string;
  }>;

  for (const h of history) touchedIds.add(h.work_order_id);

  const createdOrUpdated = db
    .prepare(
      `
    SELECT wo.id FROM work_orders wo
    WHERE wo.organization_id = ?
      AND (
        (wo.created_at >= ? AND wo.created_at <= ?)
        OR (wo.updated_at >= ? AND wo.updated_at <= ?)
      )
  `
    )
    .all(organizationId, dayStart, dayEnd, dayStart, dayEnd) as Array<{ id: string }>;

  for (const r of createdOrUpdated) touchedIds.add(r.id);

  const items: DailyUpdateItem[] = [];
  const byWoUpdates = new Map<string, typeof updates>();
  for (const u of updates) {
    if (!byWoUpdates.has(u.work_order_id)) byWoUpdates.set(u.work_order_id, []);
    byWoUpdates.get(u.work_order_id)!.push(u);
  }

  const byWoHistory = new Map<string, typeof history>();
  for (const h of history) {
    if (!byWoHistory.has(h.work_order_id)) byWoHistory.set(h.work_order_id, []);
    byWoHistory.get(h.work_order_id)!.push(h);
  }

  let woRows: Array<{
    id: string;
    title: string;
    status: string;
    repair_location: string;
    assigned_to: string;
    description: string;
    vehicle_code: string;
    vehicle_make: string;
    vehicle_model: string;
  }> = [];

  if (touchedIds.size > 0) {
    const placeholders = [...touchedIds].map(() => "?").join(",");
    woRows = db
      .prepare(
        `
        SELECT wo.id, wo.title, wo.status, wo.repair_location, wo.assigned_to, wo.description,
               v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
        FROM work_orders wo
        JOIN vehicles v ON wo.vehicle_id = v.id
        WHERE wo.organization_id = ? AND wo.id IN (${placeholders})
      `
      )
      .all(organizationId, ...touchedIds) as Array<{
        id: string;
        title: string;
        status: string;
        repair_location: string;
        assigned_to: string;
        description: string;
        vehicle_code: string;
        vehicle_make: string;
        vehicle_model: string;
      }>;
  }

  const woById = new Map(woRows.map((w) => [w.id, w]));

  for (const id of touchedIds) {
    const wo = woById.get(id);
    if (!wo) continue;

    const lines: string[] = [];
    const hs = byWoHistory.get(id) || [];
    for (const h of hs) {
      const from = h.from_status ? `${h.from_status} → ` : "";
      lines.push(
        `Status: ${from}${h.to_status}${h.changed_by_name ? ` (${h.changed_by_name})` : ""}${h.reason ? `. ${h.reason}` : ""}`
      );
    }

    const us = byWoUpdates.get(id) || [];
    for (const u of us) {
      const who = u.posted_by_name ? `${u.posted_by_name}: ` : "";
      lines.push(`Update: ${who}${u.note}`);
    }

    if (lines.length === 0) {
      lines.push(`Recorded activity: work order updated or created on this date.`);
    }

    items.push({
      workOrderId: wo.id,
      vehicleCode: wo.vehicle_code,
      vehicleMake: wo.vehicle_make,
      vehicleModel: wo.vehicle_model,
      title: wo.title,
      status: wo.status,
      repairLocation: wo.repair_location,
      assignedTo: wo.assigned_to,
      lines,
    });
  }

  items.sort((a, b) => a.vehicleCode.localeCompare(b.vehicleCode));

  const vehicleStats = db
    .prepare(
      `
    SELECT status, COUNT(*) as c FROM vehicles WHERE organization_id = ? GROUP BY status
  `
    )
    .all(organizationId) as Array<{ status: string; c: number }>;

  const op = vehicleStats.find((s) => s.status === "operational")?.c ?? 0;
  const dep = vehicleStats.find((s) => s.status === "deployed")?.c ?? 0;
  const openWo = db
    .prepare(
      `
    SELECT COUNT(*) as c FROM work_orders WHERE organization_id = ?
      AND status NOT IN ('completed', 'validated', 'closed', 'cancelled', 'rejected')
  `
    )
    .get(organizationId) as { c: number };

  const heading = `TODAY'S UPDATES — ${padHeading(dateIso)}`;
  const sub =
    "(Auto-generated from Fleet Hub — review before posting to WhatsApp)\n\n" +
    `Fleet snapshot: ~${op + dep} vehicles available/deployed; ${openWo.c} open work orders (all dates).\n`;

  let body = "";
  items.forEach((it, i) => {
    body += `\n${i + 1}. ${it.vehicleCode} (${it.vehicleMake} ${it.vehicleModel}) — ${it.title}\n`;
    body += `   • Current status: ${it.status}`;
    if (it.assignedTo) body += ` · Assigned: ${it.assignedTo}`;
    body += ` · Location: ${it.repairLocation}\n`;
    for (const ln of it.lines) {
      body += `   • ${ln}\n`;
    }
  });

  if (items.length === 0) {
    body =
      "\nNo work order status changes or progress updates were recorded for this date.\n" +
      "Tip: log progress notes on work orders to build tomorrow's update automatically.\n";
  }

  const markdown = `*${heading}*\n${sub}${body}`;
  const plainText = `${heading}\n${sub}${body}`.replace(/\*/g, "");

  return {
    date: dateIso,
    headline: heading,
    markdown,
    plainText,
    items,
  };
}
