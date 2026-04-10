/**
 * Firestore sync service — READ-ONLY access to shared Firebase collections.
 *
 * CRITICAL SAFETY RULES (see plan: "External Platform Safety"):
 * 1. This module NEVER writes to, updates, or deletes Firestore documents.
 * 2. All data read from Firestore is cached into local SQLite tables only.
 * 3. Sync functions are idempotent: re-running produces the same local state.
 * 4. Failed syncs roll back the local SQLite transaction — no partial state.
 * 5. Reads are batched (max 100 docs per query) and throttled (min 60s between cycles).
 * 6. If Firestore is unreachable, the function returns gracefully with an error flag.
 */

import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import {
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";
import { getDb } from "./db";
import fs from "fs";

const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "";

let adminApp: App | null = null;
let adminFirestore: Firestore | null = null;

function getAdminFirestore(): Firestore | null {
  if (adminFirestore) return adminFirestore;

  if (!SERVICE_ACCOUNT_PATH || !fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.warn(
      "[firestore-sync] FIREBASE_SERVICE_ACCOUNT_PATH not set or file missing — sync disabled"
    );
    return null;
  }

  try {
    const existing = getApps();
    if (existing.length > 0 && existing.find((a) => a?.name === "fleet-sync")) {
      adminApp = existing.find((a) => a?.name === "fleet-sync")!;
    } else {
      const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
      adminApp = initializeApp({ credential: cert(sa) }, "fleet-sync");
    }
    adminFirestore = getFirestore(adminApp);
    return adminFirestore;
  } catch (err) {
    console.error("[firestore-sync] Failed to initialize Firebase Admin:", err);
    return null;
  }
}

export interface SyncResult {
  success: boolean;
  upserted: number;
  deactivated: number;
  error?: string;
}

/**
 * READ-ONLY: Sync site/location reference data from Firestore into local SQLite.
 * Source: `referenceData_sites` or `sites` collection (canonical for all 1PWR apps).
 * Target: local `reference_data` table with type = 'site'.
 *
 * Existing local records not found in the source are marked active=0, never deleted.
 */
export async function syncSitesFromFirestore(
  organizationId: string = "1pwr_lesotho"
): Promise<SyncResult> {
  const fs = getAdminFirestore();
  if (!fs) return { success: false, upserted: 0, deactivated: 0, error: "Firestore not available" };

  try {
    const snapshot = await fs
      .collection("referenceData_sites")
      .where("active", "!=", false)
      .limit(100)
      .get();

    if (snapshot.empty) {
      return { success: true, upserted: 0, deactivated: 0 };
    }

    const db = getDb();
    let upserted = 0;
    let deactivated = 0;

    const firestoreCodes = new Set<string>();

    const txn = db.transaction(() => {
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const code = data.code || doc.id;
        const label = data.name || data.label || code;
        const sortOrder = data.sortOrder ?? data.sort_order ?? 0;
        const meta = JSON.stringify({
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          country: data.country ?? "",
          firestoreId: doc.id,
        });

        firestoreCodes.add(code);

        const existing = db
          .prepare(
            "SELECT id FROM reference_data WHERE organization_id = ? AND type = 'site' AND code = ?"
          )
          .get(organizationId, code) as { id: string } | undefined;

        if (existing) {
          db.prepare(
            "UPDATE reference_data SET label = ?, sort_order = ?, meta = ?, active = 1, updated_at = datetime('now') WHERE id = ?"
          ).run(label, sortOrder, meta, existing.id);
        } else {
          db.prepare(
            "INSERT INTO reference_data (id, organization_id, type, code, label, sort_order, active, meta) VALUES (lower(hex(randomblob(16))), ?, 'site', ?, ?, ?, 1, ?)"
          ).run(organizationId, code, label, sortOrder, meta);
        }
        upserted++;
      }

      if (firestoreCodes.size > 0) {
        const allLocal = db
          .prepare(
            "SELECT id, code FROM reference_data WHERE organization_id = ? AND type = 'site' AND active = 1"
          )
          .all(organizationId) as Array<{ id: string; code: string }>;

        for (const row of allLocal) {
          if (!firestoreCodes.has(row.code)) {
            db.prepare(
              "UPDATE reference_data SET active = 0, updated_at = datetime('now') WHERE id = ?"
            ).run(row.id);
            deactivated++;
          }
        }
      }
    });

    txn();
    return { success: true, upserted, deactivated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[firestore-sync] syncSitesFromFirestore failed:", msg);
    return { success: false, upserted: 0, deactivated: 0, error: msg };
  }
}

/**
 * READ-ONLY: Cache PR status and costs from Firestore purchaseRequests collection.
 * Queries by PR number strings linked via work_order_po_links.
 * Results cached into local `pr_cost_cache` table. Stale after 1 hour.
 *
 * Never writes to or modifies the purchaseRequests collection.
 */
export async function cachePRStatusForWorkOrder(
  workOrderId: string
): Promise<SyncResult> {
  const firestore = getAdminFirestore();
  if (!firestore)
    return { success: false, upserted: 0, deactivated: 0, error: "Firestore not available" };

  try {
    const db = getDb();

    const poLinks = db
      .prepare(
        "SELECT pr_number FROM work_order_po_links WHERE work_order_id = ? AND pr_number != ''"
      )
      .all(workOrderId) as Array<{ pr_number: string }>;

    if (poLinks.length === 0) {
      return { success: true, upserted: 0, deactivated: 0 };
    }

    let upserted = 0;
    const prNumbers = poLinks.map((l) => l.pr_number);
    const batches: string[][] = [];
    for (let i = 0; i < prNumbers.length; i += 10) {
      batches.push(prNumbers.slice(i, i + 10));
    }

    const txn = db.transaction(() => {
      for (const batch of batches) {
        for (const prNum of batch) {
          void cacheSinglePR(firestore, db, prNum, workOrderId).then(
            (cached) => {
              if (cached) upserted++;
            }
          );
        }
      }
    });

    // Since Firestore reads are async, we need to gather results first
    const results = await Promise.all(
      prNumbers.map((prNum) =>
        cacheSinglePR(firestore, db, prNum, workOrderId)
      )
    );

    const txnWrite = db.transaction(() => {
      for (const r of results) {
        if (!r) continue;
        db.prepare(
          `INSERT INTO pr_cost_cache (id, work_order_id, vehicle_code, pr_number, pr_status, approved_amount, currency, description, last_synced_at)
           VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(pr_number) DO UPDATE SET
             pr_status = excluded.pr_status,
             approved_amount = excluded.approved_amount,
             description = excluded.description,
             last_synced_at = datetime('now')`
        ).run(
          r.workOrderId,
          r.vehicleCode,
          r.prNumber,
          r.prStatus,
          r.approvedAmount,
          r.currency,
          r.description
        );
        upserted++;
      }
    });

    txnWrite();
    return { success: true, upserted, deactivated: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[firestore-sync] cachePRStatusForWorkOrder failed:", msg);
    return { success: false, upserted: 0, deactivated: 0, error: msg };
  }
}

interface CachedPR {
  workOrderId: string;
  vehicleCode: string;
  prNumber: string;
  prStatus: string;
  approvedAmount: number;
  currency: string;
  description: string;
}

async function cacheSinglePR(
  firestore: Firestore,
  _db: ReturnType<typeof getDb>,
  prNumber: string,
  workOrderId: string
): Promise<CachedPR | null> {
  try {
    const snapshot = await firestore
      .collection("purchaseRequests")
      .where("prNumber", "==", prNumber)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const data = doc.data();

    return {
      workOrderId,
      vehicleCode: data.vehicle?.code || data.vehicleCode || "",
      prNumber,
      prStatus: data.status || "",
      approvedAmount: data.totalAmount || data.approvedAmount || 0,
      currency: data.currency || "LSL",
      description: data.description || data.title || "",
    };
  } catch {
    return null;
  }
}

/**
 * READ-ONLY: Fetch AM asset allocations for a given set of allocation IDs.
 * Returns allocation data for display only — never modifies AM collections.
 *
 * Results are returned in-memory (not cached to SQLite) since they're
 * transient and only needed during trip display.
 */
export interface AMAllocationSnapshot {
  allocationId: string;
  assetId: string;
  assetName: string;
  assetCategory: string;
  quantity: number;
  checkedOutTo: string;
  checkedOutAt: string;
}

export async function fetchAMAllocations(
  allocationIds: string[]
): Promise<{ success: boolean; allocations: AMAllocationSnapshot[]; error?: string }> {
  const firestore = getAdminFirestore();
  if (!firestore)
    return { success: false, allocations: [], error: "Firestore not available" };

  if (allocationIds.length === 0) {
    return { success: true, allocations: [] };
  }

  try {
    const allocations: AMAllocationSnapshot[] = [];
    const batches: string[][] = [];
    for (let i = 0; i < allocationIds.length; i += 10) {
      batches.push(allocationIds.slice(i, i + 10));
    }

    for (const batch of batches) {
      const snapshot = await firestore
        .collection("am_core_allocations")
        .where("__name__", "in", batch)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        allocations.push({
          allocationId: doc.id,
          assetId: data.assetId || "",
          assetName: data.assetName || data.asset?.name || "",
          assetCategory: data.category || data.asset?.category || "",
          quantity: data.quantity || 1,
          checkedOutTo: data.checkedOutTo || data.userId || "",
          checkedOutAt: data.checkedOutAt?.toDate?.()?.toISOString() || "",
        });
      }
    }

    return { success: true, allocations };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[firestore-sync] fetchAMAllocations failed:", msg);
    return { success: false, allocations: [], error: msg };
  }
}
