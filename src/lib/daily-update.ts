import type Database from "better-sqlite3";
import { assetClassLabel } from "@/types";

export interface DailyUpdateItem {
  workOrderId: string;
  vehicleCode: string;
  vehicleMake: string;
  vehicleModel: string;
  assetClass: string;
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

/** WhatsApp report leads with these road-fleet buckets; other asset classes appear only when there is activity today. */
const ASSET_4WD = new Set(["4wd", "light-vehicle"]);
const ASSET_CARGO = new Set(["cargo-truck", "heavy-vehicle"]);

export function isPrimaryWhatsAppFleetClass(assetClass: string): boolean {
  return ASSET_4WD.has(assetClass) || ASSET_CARGO.has(assetClass);
}

function summarizeStatusCounts(
  rows: Array<{ asset_class: string; status: string; c: number }>,
  classes: Set<string>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!classes.has(r.asset_class)) continue;
    out[r.status] = (out[r.status] || 0) + r.c;
  }
  return out;
}

function formatBucketStatusLine(label: string, byStatus: Record<string, number>): string {
  const op = byStatus.operational ?? 0;
  const dep = byStatus.deployed ?? 0;
  const mHq = byStatus["maintenance-hq"] ?? 0;
  const m3 = byStatus["maintenance-3rdparty"] ?? 0;
  const ap = byStatus["awaiting-parts"] ?? 0;
  const gr = byStatus.grounded ?? 0;
  const wo = byStatus["written-off"] ?? 0;
  const maint = mHq + m3 + ap;
  const road = op + dep;
  const parts = [
    `${road} road (${op} op, ${dep} deployed)`,
    maint > 0 ? `${maint} in maintenance/3rd/awaiting parts` : null,
    gr > 0 ? `${gr} grounded` : null,
    wo > 0 ? `${wo} written off` : null,
  ].filter(Boolean);
  return `${label}: ${parts.join("; ")}.`;
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
    vehicle_asset_class: string;
  }> = [];

  if (touchedIds.size > 0) {
    const placeholders = [...touchedIds].map(() => "?").join(",");
    woRows = db
      .prepare(
        `
        SELECT wo.id, wo.title, wo.status, wo.repair_location, wo.assigned_to, wo.description,
               v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model,
               v.asset_class as vehicle_asset_class
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
        vehicle_asset_class: string;
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
      assetClass: wo.vehicle_asset_class || "",
      title: wo.title,
      status: wo.status,
      repairLocation: wo.repair_location,
      assignedTo: wo.assigned_to,
      lines,
    });
  }

  items.sort((a, b) => {
    const ap = isPrimaryWhatsAppFleetClass(a.assetClass) ? 0 : 1;
    const bp = isPrimaryWhatsAppFleetClass(b.assetClass) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.vehicleCode.localeCompare(b.vehicleCode);
  });

  const primaryItems = items.filter((i) => isPrimaryWhatsAppFleetClass(i.assetClass));
  const otherItems = items.filter((i) => !isPrimaryWhatsAppFleetClass(i.assetClass));

  const fleetClassRows = db
    .prepare(
      `
    SELECT asset_class, status, COUNT(*) as c
    FROM vehicles
    WHERE organization_id = ?
      AND asset_class IN ('4wd', 'light-vehicle', 'cargo-truck', 'heavy-vehicle')
    GROUP BY asset_class, status
  `
    )
    .all(organizationId) as Array<{ asset_class: string; status: string; c: number }>;

  const snap4wd = summarizeStatusCounts(fleetClassRows, ASSET_4WD);
  const snapCargo = summarizeStatusCounts(fleetClassRows, ASSET_CARGO);

  const openWo = db
    .prepare(
      `
    SELECT COUNT(*) as c FROM work_orders WHERE organization_id = ?
      AND status NOT IN ('completed', 'validated', 'closed', 'cancelled', 'rejected')
  `
    )
    .get(organizationId) as { c: number };

  const heading = `TODAY'S UPDATES — ${padHeading(dateIso)}`;

  let sub =
    "(Auto-generated from Fleet Hub — review before posting to WhatsApp)\n\n" +
    "Fleet status (4WD & cargo trucks):\n" +
    `${formatBucketStatusLine("4WD", snap4wd)}\n` +
    `${formatBucketStatusLine("Cargo trucks", snapCargo)}\n` +
    `Open work orders (all categories, all dates): ${openWo.c}.\n`;

  if (otherItems.length > 0) {
    const brief = otherItems
      .map((it) => `${it.vehicleCode} (${assetClassLabel(it.assetClass)})`)
      .join(", ");
    sub += `\nOther categories (activity today only): ${brief}.\n`;
  }

  function formatWoBlock(index: number, it: DailyUpdateItem): string {
    let block = `\n${index}. ${it.vehicleCode} (${it.vehicleMake} ${it.vehicleModel}) — ${it.title}\n`;
    block += `   • Current status: ${it.status}`;
    if (it.assignedTo) block += ` · Assigned: ${it.assignedTo}`;
    block += ` · Location: ${it.repairLocation}\n`;
    for (const ln of it.lines) {
      block += `   • ${ln}\n`;
    }
    return block;
  }

  let body = "";
  let idx = 0;
  if (primaryItems.length > 0) {
    body += "\n— Road fleet (4WD & cargo trucks) —\n";
    primaryItems.forEach((it) => {
      idx += 1;
      body += formatWoBlock(idx, it);
    });
  }
  if (otherItems.length > 0) {
    body += "\n— Other categories (only shown when there is activity today) —\n";
    otherItems.forEach((it) => {
      idx += 1;
      body += formatWoBlock(idx, it);
    });
  }

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
