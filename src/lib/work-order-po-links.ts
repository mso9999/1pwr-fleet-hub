import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

export interface WorkOrderPoLinkInput {
  prNumber?: string;
  poNumber?: string;
  vendor?: string;
  description?: string;
  amount?: number;
  currency?: string;
  status?: string;
  prSystemUrl?: string;
  /** When false, do not move WO from needs-parts → pr-submitted after link. Default true. */
  advanceProcurementStatus?: boolean;
}

export interface AddWorkOrderPoLinkResult {
  ok: true;
  linkId: string;
  workOrderStatusAfter: string;
  advancedFromNeedsParts: boolean;
}

export interface AddWorkOrderPoLinkError {
  ok: false;
  error: string;
  status: number;
}

/**
 * Inserts a PR/PO link row, refreshes third_party_cost on the WO, and optionally
 * advances needs-parts → pr-submitted (with status history).
 */
export function addWorkOrderPoLink(
  db: Database.Database,
  workOrderId: string,
  body: WorkOrderPoLinkInput,
  historyActor: { id: string; name: string }
): AddWorkOrderPoLinkResult | AddWorkOrderPoLinkError {
  const wo = db
    .prepare("SELECT id, status FROM work_orders WHERE id = ?")
    .get(workOrderId) as { id: string; status: string } | undefined;
  if (!wo) {
    return { ok: false, error: "Work order not found", status: 404 };
  }

  const linkId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO work_order_po_links (id, work_order_id, pr_number, po_number, vendor, description, amount, currency, status, pr_system_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    linkId,
    workOrderId,
    body.prNumber || "",
    body.poNumber || "",
    body.vendor || "",
    body.description || "",
    body.amount ?? 0,
    body.currency || "LSL",
    body.status || "pending",
    body.prSystemUrl || "https://pr.1pwrafrica.com"
  );

  const poSum = db
    .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM work_order_po_links WHERE work_order_id = ?")
    .get(workOrderId) as { total: number };

  db.prepare(
    "UPDATE work_orders SET third_party_cost = ?, total_cost = parts_cost + labour_cost + ?, updated_at = ? WHERE id = ?"
  ).run(poSum.total, poSum.total, now, workOrderId);

  let advancedFromNeedsParts = false;
  let workOrderStatusAfter = wo.status;
  const shouldAdvance = body.advanceProcurementStatus !== false && wo.status === "needs-parts";

  if (shouldAdvance) {
    db.prepare("UPDATE work_orders SET status = 'pr-submitted', updated_at = ? WHERE id = ?").run(now, workOrderId);
    db.prepare(`
      INSERT INTO work_order_status_history (work_order_id, from_status, to_status, changed_by_id, changed_by_name, reason, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      workOrderId,
      "needs-parts",
      "pr-submitted",
      historyActor.id,
      historyActor.name,
      "Purchase requisition linked to this work order.",
      now
    );
    advancedFromNeedsParts = true;
    workOrderStatusAfter = "pr-submitted";
  }

  return { ok: true, linkId, workOrderStatusAfter, advancedFromNeedsParts };
}
