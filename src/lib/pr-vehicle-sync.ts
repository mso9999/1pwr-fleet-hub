/**
 * Push Fleet Hub vehicle records into PR Firestore `referenceData_vehicles`.
 * FM is the source of truth; PR holds a read-only mirror for expense-type dropdowns.
 *
 * Sync strategy: FM push on vehicle create/update/delete (see vehicles API routes).
 * Firestore document id = FM vehicle UUID (`fmVehicleId`).
 */

import { getFirestore } from "firebase-admin/firestore";
import { getFleetAdminApp } from "./firebase-admin-init";

const COLLECTION = "referenceData_vehicles";

const ORG_NAMES: Record<string, string> = {
  "1pwr_lesotho": "1PWR Lesotho",
  "1pwr_benin": "1PWR Benin",
  "1pwr_zambia": "1PWR Zambia",
};

export interface FmVehicleRow {
  id: string;
  organization_id: string;
  code: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  license_plate?: string | null;
  vin?: string | null;
  engine_number?: string | null;
  status?: string | null;
  pr_firestore_id?: string | null;
}

export interface PrVehicleSyncResult {
  success: boolean;
  firestoreDocId?: string;
  error?: string;
}

function isActiveStatus(status: string | undefined | null): boolean {
  return (status || "operational") !== "written-off";
}

export function mapFmVehicleToPrFirestore(vehicle: FmVehicleRow, options?: { deactivate?: boolean }) {
  const orgId = (vehicle.organization_id || "1pwr_lesotho").toLowerCase().replace(/\s+/g, "_");
  const orgName = ORG_NAMES[orgId] || orgId;
  const fleetCode = String(vehicle.code || "").trim();
  const now = new Date().toISOString();

  return {
    id: vehicle.id,
    fmVehicleId: vehicle.id,
    fleetCode,
    code: fleetCode,
    name: fleetCode,
    registrationNumber: vehicle.license_plate || "",
    year: vehicle.year ?? null,
    make: vehicle.make || "",
    model: vehicle.model || "",
    vinNumber: vehicle.vin || "",
    engineNumber: vehicle.engine_number || "",
    active: options?.deactivate ? false : isActiveStatus(vehicle.status),
    organizationId: orgId,
    organization: { id: orgId, name: orgName },
    source: "fleet_hub",
    syncedAt: now,
    updatedAt: now,
  };
}

export async function syncVehicleToPrFirestore(
  vehicle: FmVehicleRow,
  options?: { deactivate?: boolean }
): Promise<PrVehicleSyncResult> {
  const app = getFleetAdminApp();
  if (!app) {
    return { success: false, error: "Firebase Admin not configured" };
  }

  try {
    const firestore = getFirestore(app);
    const docId = vehicle.id;
    const payload = mapFmVehicleToPrFirestore(vehicle, options);

    await firestore.collection(COLLECTION).doc(docId).set(payload, { merge: true });

    const legacyId = String(vehicle.pr_firestore_id || "").trim();
    if (legacyId && legacyId !== docId) {
      await firestore.collection(COLLECTION).doc(legacyId).set(
        {
          active: false,
          supersededBy: docId,
          fmVehicleId: docId,
          updatedAt: payload.updatedAt,
          source: "fleet_hub",
        },
        { merge: true }
      );
    }

    return { success: true, firestoreDocId: docId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pr-vehicle-sync] syncVehicleToPrFirestore failed:", msg);
    return { success: false, error: msg };
  }
}

export async function syncAllVehiclesToPrFirestore(
  vehicles: FmVehicleRow[]
): Promise<{ synced: number; failed: number; errors: string[] }> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const vehicle of vehicles) {
    const result = await syncVehicleToPrFirestore(vehicle);
    if (result.success) {
      synced++;
    } else {
      failed++;
      if (result.error) {
        errors.push(`${vehicle.code} (${vehicle.id}): ${result.error}`);
      }
    }
  }

  return { synced, failed, errors };
}
