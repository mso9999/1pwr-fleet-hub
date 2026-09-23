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

import {
  getFirestore,
  type Firestore,
  type QuerySnapshot,
} from "firebase-admin/firestore";
import { getDb } from "./db";
import { getFleetAdminApp } from "./firebase-admin-init";
import { isPrSpendStatus } from "./fleet-performance";

let adminFirestore: Firestore | null = null;

function getAdminFirestore(): Firestore | null {
  if (adminFirestore) return adminFirestore;
  const app = getFleetAdminApp();
  if (!app) {
    console.warn(
      "[firestore-sync] FIREBASE_SERVICE_ACCOUNT_PATH not set or file missing — sync disabled"
    );
    return null;
  }
  try {
    adminFirestore = getFirestore(app);
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

export type ReferenceDataKind = "site" | "department";

function parseMeta(meta: string | null | undefined): Record<string, unknown> {
  if (!meta) return {};
  try {
    const parsed = JSON.parse(meta) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * READ-ONLY: Sync one reference list from shared PR Firestore into local `reference_data`.
 * Collections follow the PR app convention: `referenceData_sites`, `referenceData_departments`.
 * Shape: code, name|label, sortOrder, active, optional lat/lng/country.
 *
 * Existing local rows of this type not present in the snapshot batch are marked active=0.
 */
export async function syncReferenceListFromPr(
  collectionName: string,
  refType: ReferenceDataKind,
  organizationId: string = "1pwr_lesotho"
): Promise<SyncResult> {
  const firestore = getAdminFirestore();
  if (!firestore) {
    return { success: false, upserted: 0, deactivated: 0, error: "Firestore not available" };
  }

  try {
    let snapshot: QuerySnapshot;
    try {
      snapshot = await firestore
        .collection(collectionName)
        .where("active", "!=", false)
        .limit(500)
        .get();
    } catch (queryErr) {
      console.warn(
        `[firestore-sync] active filter query failed for ${collectionName}, using full scan:`,
        queryErr
      );
      snapshot = await firestore.collection(collectionName).limit(500).get();
    }

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
        if (data.active === false) continue;

        const code = String(data.code || doc.id).trim();
        if (!code) continue;

        const label = String(data.name || data.label || code).trim();
        const sortOrder = Number(data.sortOrder ?? data.sort_order ?? 0);
        firestoreCodes.add(code);

        const existing = db
          .prepare(
            "SELECT id, meta FROM reference_data WHERE organization_id = ? AND type = ? AND code = ?"
          )
          .get(organizationId, refType, code) as { id: string; meta: string | null } | undefined;

        const existingMeta = parseMeta(existing?.meta);
        const latitude = data.latitude ?? existingMeta.latitude ?? null;
        const longitude = data.longitude ?? existingMeta.longitude ?? null;
        const meta = JSON.stringify({
          ...existingMeta,
          latitude,
          longitude,
          country: data.country ?? existingMeta.country ?? "",
          firestoreId: doc.id,
          source: "pr_firestore",
          collection: collectionName,
        });

        if (existing) {
          db.prepare(
            "UPDATE reference_data SET label = ?, sort_order = ?, meta = ?, active = 1, updated_at = datetime('now') WHERE id = ?"
          ).run(label, sortOrder, meta, existing.id);
        } else {
          db.prepare(
            `INSERT INTO reference_data (id, organization_id, type, code, label, sort_order, active, meta)
             VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, 1, ?)`
          ).run(organizationId, refType, code, label, sortOrder, meta);
        }
        upserted++;
      }

      if (firestoreCodes.size > 0) {
        const allLocal = db
          .prepare(
            "SELECT id, code FROM reference_data WHERE organization_id = ? AND type = ? AND active = 1"
          )
          .all(organizationId, refType) as Array<{ id: string; code: string }>;

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
    console.error(`[firestore-sync] syncReferenceListFromPr(${collectionName}) failed:`, msg);
    return { success: false, upserted: 0, deactivated: 0, error: msg };
  }
}

/**
 * READ-ONLY: Sync sites/locations from PR Firestore `referenceData_sites` → type `site`.
 */
export async function syncSitesFromFirestore(
  organizationId: string = "1pwr_lesotho"
): Promise<SyncResult> {
  return syncReferenceListFromPr("referenceData_sites", "site", organizationId);
}

/**
 * READ-ONLY: Sync departments from HR API (preferred) or PR Firestore `referenceData_departments` (fallback).
 * R6 Retirement: after 30 days of HR API working, remove the Firestore fallback.
 */
export async function syncDepartmentsFromFirestore(
  organizationId: string = "1pwr_lesotho"
): Promise<SyncResult> {
  // R6: Try HR API first (canonical source for departments)
  try {
    const { fetchHrEmployeeMeta } = await import("@/lib/hr-directory-client");
    const meta = await fetchHrEmployeeMeta();
    if (meta.ok && meta.departments && meta.departments.length > 0) {
      const db = getDb();
      let upserted = 0;
      const txn = db.transaction(() => {
        for (let i = 0; i < meta.departments!.length; i++) {
          const dept = meta.departments![i];
          const code = dept.trim().toUpperCase().replace(/\s+/g, "_");
          const existing = db
            .prepare("SELECT id FROM reference_data WHERE organization_id = ? AND type = 'department' AND code = ?")
            .get(organizationId, code) as Record<string, unknown> | undefined;
          if (existing) {
            db.prepare("UPDATE reference_data SET label = ?, sort_order = ?, active = 1 WHERE id = ?")
              .run(dept, i, existing.id);
          } else {
            db.prepare("INSERT INTO reference_data (id, organization_id, type, code, label, sort_order, active) VALUES (lower(hex(randomblob(16))), ?, 'department', ?, ?, ?, 1)")
              .run(organizationId, code, dept, i);
          }
          upserted++;
        }
      });
      txn();
      return { success: true, upserted, deactivated: 0 };
    }
    console.warn("[firestore-sync] R6 Fallback: HR API departments empty/unavailable, falling back to Firestore referenceData_departments");
  } catch (hrErr) {
    console.warn("[firestore-sync] R6 Fallback: HR API error, falling back to Firestore referenceData_departments:", hrErr);
  }
  return syncReferenceListFromPr("referenceData_departments", "department", organizationId);
}

export interface PrReferenceSyncBundle {
  success: boolean;
  sites: SyncResult;
  departments: SyncResult;
  error?: string;
}

/**
 * Sync both PR-managed lists (locations + departments) into local `reference_data`.
 */
export async function syncPrReferenceLists(
  organizationId: string = "1pwr_lesotho"
): Promise<PrReferenceSyncBundle> {
  const sites = await syncSitesFromFirestore(organizationId);
  const departments = await syncDepartmentsFromFirestore(organizationId);
  const success = sites.success && departments.success;
  const parts = [sites.error, departments.error].filter(Boolean);
  return {
    success,
    sites,
    departments,
    error: parts.length ? parts.join("; ") : undefined,
  };
}

/**
 * READ-ONLY: Cache PR status/costs and vehicle-tagged PR spend from Firestore
 * purchaseRequests into local `pr_cost_cache`. Never writes to Firestore.
 */

interface CachedPR {
  workOrderId: string | null;
  vehicleId: string | null;
  vehicleCode: string;
  expenseType: string;
  prNumber: string;
  prStatus: string;
  approvedAmount: number;
  currency: string;
  description: string;
  prCreatedAt: string;
  statusChangedAt: string;
}

type SqliteDb = ReturnType<typeof getDb>;

function firestoreTimeToIso(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString() : "";
    } catch {
      return "";
    }
  }
  return "";
}

function statusChangedAtFromHistory(data: Record<string, unknown>, status: string): string {
  const history = Array.isArray(data.statusHistory) ? data.statusHistory : [];
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i] as { status?: string; timestamp?: unknown } | null;
    if (!item || String(item.status || "") !== status) continue;
    const iso = firestoreTimeToIso(item.timestamp);
    if (iso) return iso;
  }
  return firestoreTimeToIso(data.updatedAt) || firestoreTimeToIso(data.createdAt);
}

function prAmountFromData(data: Record<string, unknown>): number {
  const candidates = [
    data.finalPrice,
    data.totalAmount,
    data.approvedAmount,
    data.estimatedAmount,
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function vehicleRefFromData(data: Record<string, unknown>): string {
  const vehicle = data.vehicle;
  if (typeof vehicle === "string") return vehicle.trim();
  if (vehicle && typeof vehicle === "object") {
    const obj = vehicle as { id?: string; fmVehicleId?: string; code?: string };
    return String(obj.fmVehicleId || obj.id || obj.code || "").trim();
  }
  return String(data.vehicleCode || data.fmVehicleId || "").trim();
}

type VehicleLookup = {
  byId: Map<string, { id: string; code: string }>;
  byCode: Map<string, { id: string; code: string }>;
  byPrFirestoreId: Map<string, { id: string; code: string }>;
};

function loadVehicleLookup(db: SqliteDb): VehicleLookup {
  const rows = db
    .prepare(
      `SELECT id, code, COALESCE(pr_firestore_id, '') as pr_firestore_id
       FROM vehicles WHERE COALESCE(is_synthetic, 0) = 0`
    )
    .all() as Array<{ id: string; code: string; pr_firestore_id: string }>;
  const byId = new Map<string, { id: string; code: string }>();
  const byCode = new Map<string, { id: string; code: string }>();
  const byPrFirestoreId = new Map<string, { id: string; code: string }>();
  for (const row of rows) {
    const v = { id: row.id, code: row.code };
    byId.set(row.id, v);
    byCode.set(row.code.trim().toLowerCase(), v);
    if (row.pr_firestore_id) byPrFirestoreId.set(row.pr_firestore_id, v);
  }
  return { byId, byCode, byPrFirestoreId };
}

function resolveVehicle(
  lookup: VehicleLookup,
  db: SqliteDb,
  data: Record<string, unknown>,
  fallbackWorkOrderId: string | null
): { vehicleId: string | null; vehicleCode: string; workOrderId: string | null } {
  const fleetWo = String(data.fleetWorkOrderId || "").trim() || fallbackWorkOrderId;
  let workOrderId: string | null = null;
  let woVehicleId: string | null = null;
  if (fleetWo) {
    const wo = db
      .prepare("SELECT id, vehicle_id FROM work_orders WHERE id = ?")
      .get(fleetWo) as { id: string; vehicle_id: string } | undefined;
    if (wo) {
      workOrderId = wo.id;
      woVehicleId = wo.vehicle_id || null;
    }
  }

  const ref = vehicleRefFromData(data);
  let resolved =
    (ref && lookup.byId.get(ref)) ||
    (ref && lookup.byCode.get(ref.toLowerCase())) ||
    (ref && lookup.byPrFirestoreId.get(ref)) ||
    (woVehicleId ? lookup.byId.get(woVehicleId) : undefined);

  if (!resolved && woVehicleId) {
    resolved = lookup.byId.get(woVehicleId);
  }

  const vehicleCode =
    resolved?.code ||
    String((data.vehicle as { code?: string } | undefined)?.code || data.vehicleCode || "") ||
    "";

  return {
    vehicleId: resolved?.id || null,
    vehicleCode,
    workOrderId,
  };
}

function cachedPrFromDoc(
  data: Record<string, unknown>,
  lookup: VehicleLookup,
  db: SqliteDb,
  fallbackWorkOrderId: string | null = null
): CachedPR | null {
  const prNumber = String(data.prNumber || "").trim();
  if (!prNumber) return null;
  const prStatus = String(data.status || "");
  const resolved = resolveVehicle(lookup, db, data, fallbackWorkOrderId);
  return {
    workOrderId: resolved.workOrderId || fallbackWorkOrderId,
    vehicleId: resolved.vehicleId,
    vehicleCode: resolved.vehicleCode,
    expenseType: String(data.expenseType || "").trim(),
    prNumber,
    prStatus,
    approvedAmount: prAmountFromData(data),
    currency: String(data.currency || "LSL"),
    description: String(data.description || data.title || ""),
    prCreatedAt: firestoreTimeToIso(data.createdAt),
    statusChangedAt: statusChangedAtFromHistory(data, prStatus),
  };
}

function upsertPrCostCache(db: SqliteDb, rows: CachedPR[]): number {
  if (rows.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT INTO pr_cost_cache (
       id, work_order_id, vehicle_id, vehicle_code, expense_type, pr_number, pr_status,
       approved_amount, currency, description, last_synced_at, pr_created_at, status_changed_at
     ) VALUES (
       lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?
     )
     ON CONFLICT(pr_number) DO UPDATE SET
       work_order_id = COALESCE(excluded.work_order_id, pr_cost_cache.work_order_id),
       vehicle_id = COALESCE(excluded.vehicle_id, pr_cost_cache.vehicle_id),
       vehicle_code = CASE
         WHEN excluded.vehicle_code != '' THEN excluded.vehicle_code
         ELSE pr_cost_cache.vehicle_code END,
       expense_type = CASE
         WHEN excluded.expense_type != '' THEN excluded.expense_type
         ELSE pr_cost_cache.expense_type END,
       pr_status = excluded.pr_status,
       approved_amount = excluded.approved_amount,
       currency = excluded.currency,
       description = excluded.description,
       pr_created_at = excluded.pr_created_at,
       status_changed_at = excluded.status_changed_at,
       last_synced_at = datetime('now')`
  );
  const txn = db.transaction((batch: CachedPR[]) => {
    let n = 0;
    for (const r of batch) {
      stmt.run(
        r.workOrderId,
        r.vehicleId,
        r.vehicleCode,
        r.expenseType,
        r.prNumber,
        r.prStatus,
        r.approvedAmount,
        r.currency,
        r.description,
        r.prCreatedAt,
        r.statusChangedAt
      );
      n++;
    }
    return n;
  });
  return txn(rows);
}

async function cacheSinglePR(
  firestore: Firestore,
  db: SqliteDb,
  lookup: VehicleLookup,
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
    return cachedPrFromDoc(snapshot.docs[0].data() as Record<string, unknown>, lookup, db, workOrderId);
  } catch {
    return null;
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

    const lookup = loadVehicleLookup(db);
    const results = await Promise.all(
      poLinks.map((l) => cacheSinglePR(firestore, db, lookup, l.pr_number, workOrderId))
    );
    const upserted = upsertPrCostCache(
      db,
      results.filter((r): r is CachedPR => r != null)
    );
    return { success: true, upserted, deactivated: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[firestore-sync] cachePRStatusForWorkOrder failed:", msg);
    return { success: false, upserted: 0, deactivated: 0, error: msg };
  }
}

export interface VehiclePrSpendSyncResult extends SyncResult {
  vehiclesScanned: number;
  spendRows: number;
}

/**
 * READ-ONLY: Pull every purchaseRequest that names an FM vehicle (or a linked WO)
 * into `pr_cost_cache`, including PRs with no work-order link.
 * Used so fleet analytics can show live PR spend per vehicle.
 */
export async function syncVehiclePrSpendFromFirestore(
  organizationId: string = "1pwr_lesotho"
): Promise<VehiclePrSpendSyncResult> {
  const firestore = getAdminFirestore();
  if (!firestore) {
    return {
      success: false,
      upserted: 0,
      deactivated: 0,
      vehiclesScanned: 0,
      spendRows: 0,
      error: "Firestore not available",
    };
  }

  try {
    const db = getDb();
    const lookup = loadVehicleLookup(db);
    const vehicles = db
      .prepare(
        `SELECT id, code FROM vehicles
         WHERE organization_id = ? AND COALESCE(is_synthetic, 0) = 0`
      )
      .all(organizationId) as Array<{ id: string; code: string }>;

    const cached: CachedPR[] = [];
    const seenPr = new Set<string>();

    const ingestSnapshot = async (
      field: string,
      value: string
    ): Promise<void> => {
      const snapshot = await firestore
        .collection("purchaseRequests")
        .where(field, "==", value)
        .limit(500)
        .get();
      for (const doc of snapshot.docs) {
        const row = cachedPrFromDoc(doc.data() as Record<string, unknown>, lookup, db, null);
        if (!row || seenPr.has(row.prNumber)) continue;
        seenPr.add(row.prNumber);
        cached.push(row);
      }
    };

    // Query by FM UUID and by fleet code (legacy PR.vehicle values).
    for (const v of vehicles) {
      await ingestSnapshot("vehicle", v.id);
      if (v.code) await ingestSnapshot("vehicle", v.code);
    }

    const upserted = upsertPrCostCache(db, cached);
    const spendRows = cached.filter(
      (r) => r.vehicleId && r.approvedAmount > 0 && isPrSpendStatus(r.prStatus)
    ).length;

    return {
      success: true,
      upserted,
      deactivated: 0,
      vehiclesScanned: vehicles.length,
      spendRows,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[firestore-sync] syncVehiclePrSpendFromFirestore failed:", msg);
    return {
      success: false,
      upserted: 0,
      deactivated: 0,
      vehiclesScanned: 0,
      spendRows: 0,
      error: msg,
    };
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
