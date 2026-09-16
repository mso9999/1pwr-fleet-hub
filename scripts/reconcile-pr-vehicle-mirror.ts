#!/usr/bin/env npx tsx
/**
 * Reconcile the PR Firestore vehicle mirror (referenceData_vehicles) with FM.
 *
 * Two passes:
 *  1. Push every FM vehicle to its canonical mirror doc (id = FM UUID) via the
 *     standard sync (syncAllVehiclesToPrFirestore).
 *  2. Legacy docs (id ≠ FM UUID): match by fleet code + org. Matched docs get
 *     fmVehicleId + supersededBy so old PR references still resolve; docs in a
 *     MAIN country org are additionally deactivated (the canonical doc now
 *     covers the dropdown). Sub-org copies (neo1/smp/pueco_*) stay active —
 *     those PR forms filter by the sub-org — but gain fmVehicleId so the
 *     work-order picker resolves them.
 *
 * Ambiguous codes (two FM vehicles share the code in the same fleet org) are
 * reported, not touched.
 *
 * Usage:
 *   npx tsx scripts/reconcile-pr-vehicle-mirror.ts           # dry run
 *   npx tsx scripts/reconcile-pr-vehicle-mirror.ts --apply   # write
 *
 * On the server: FM_DB_PATH=/var/www/fleet-hub/data/fleet-hub.db npx tsx scripts/reconcile-pr-vehicle-mirror.ts --apply
 */

import Database from "better-sqlite3";
import path from "path";
import { getFirestore } from "firebase-admin/firestore";
import { getFleetAdminApp } from "../src/lib/firebase-admin-init";
import {
  syncAllVehiclesToPrFirestore,
  type FmVehicleRow,
} from "../src/lib/pr-vehicle-sync";

const APPLY = process.argv.includes("--apply");
const DB_PATH = process.env.FM_DB_PATH || path.join(__dirname, "..", "fleet-hub.db");
const COLLECTION = "referenceData_vehicles";

/** PR mirror org → FM fleet org (sub-entities share the country fleet). */
function mirrorOrgToFleetOrg(org: string): string {
  const o = (org || "").toLowerCase();
  if (["1pwr_zambia", "kuwala"].includes(o)) return "1pwr_zambia";
  if (["1pwr_benin", "mgb", "pueco_benin", "inclusive_pueco_benin"].includes(o)) return "1pwr_benin";
  return "1pwr_lesotho";
}
const MAIN_ORGS = new Set(["1pwr_lesotho", "1pwr_zambia", "1pwr_benin"]);

interface MirrorDoc {
  id: string;
  fmVehicleId?: string;
  fleetCode?: string;
  code?: string;
  name?: string;
  organizationId?: string;
  active?: boolean;
}

async function main(): Promise<void> {
  console.log(`=== FM → PR vehicle mirror reconcile (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);
  console.log(`SQLite: ${DB_PATH}`);

  const db = new Database(DB_PATH, { readonly: true });
  const vehicles = db
    .prepare(
      `SELECT id, organization_id, code, make, model, year, license_plate, vin, engine_number, status, pr_firestore_id
       FROM vehicles WHERE COALESCE(is_synthetic, 0) = 0 ORDER BY organization_id, code`
    )
    .all() as FmVehicleRow[];
  db.close();
  console.log(`FM vehicles: ${vehicles.length}`);

  // Pass 1: canonical push
  if (APPLY) {
    const push = await syncAllVehiclesToPrFirestore(vehicles);
    console.log(`Canonical push: synced=${push.synced} failed=${push.failed}`);
    for (const e of push.errors) console.log(`  push error: ${e}`);
  } else {
    console.log("Canonical push: skipped (dry run)");
  }

  // Pass 2: legacy doc reconciliation
  const app = getFleetAdminApp();
  if (!app) {
    console.error("Firebase Admin not configured — cannot read the mirror.");
    process.exit(1);
  }
  const firestore = getFirestore(app);
  const snap = await firestore.collection(COLLECTION).get();
  const mirror: MirrorDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MirrorDoc, "id">) }));

  // code+org → FM vehicles (ambiguity detection)
  const byCodeOrg = new Map<string, FmVehicleRow[]>();
  for (const v of vehicles) {
    const key = `${(v.code || "").trim().toLowerCase()}|${(v.organization_id || "").toLowerCase()}`;
    const list = byCodeOrg.get(key) || [];
    list.push(v);
    byCodeOrg.set(key, list);
  }

  let annotated = 0;
  let deactivated = 0;
  let skippedAmbiguous: string[] = [];
  let unmatched: string[] = [];
  let alreadyCanonical = 0;

  for (const doc of mirror) {
    const fmId = String(doc.fmVehicleId || "").trim();
    if (fmId && fmId === doc.id) {
      alreadyCanonical++;
      continue;
    }
    const code = String(doc.fleetCode || doc.code || doc.name || "").trim().toLowerCase();
    const fleetOrg = mirrorOrgToFleetOrg(String(doc.organizationId || ""));
    const candidates = byCodeOrg.get(`${code}|${fleetOrg}`) || [];

    if (!code || candidates.length === 0) {
      unmatched.push(`${doc.id} (code='${code}', org=${doc.organizationId})`);
      continue;
    }
    if (candidates.length > 1) {
      skippedAmbiguous.push(`${doc.id} (code='${code}', org=${doc.organizationId}, ${candidates.length} FM matches)`);
      continue;
    }

    const fm = candidates[0];
    const isMainOrg = MAIN_ORGS.has(String(doc.organizationId || "").toLowerCase());
    const update: Record<string, unknown> = {
      fmVehicleId: fm.id,
      supersededBy: fm.id,
      updatedAt: new Date().toISOString(),
      source: "fleet_hub",
    };
    if (isMainOrg) {
      update.active = false; // canonical FM-UUID doc covers the dropdown
    }

    console.log(
      `${APPLY ? "WRITE" : "WOULD WRITE"} ${doc.id} → fmVehicleId=${fm.id.slice(0, 8)}… (${fm.code})${isMainOrg ? ", active:false" : ", kept active (sub-org)"}`
    );
    if (APPLY) {
      await firestore.collection(COLLECTION).doc(doc.id).set(update, { merge: true });
    }
    annotated++;
    if (isMainOrg) deactivated++;
  }

  console.log(`\nCanonical already: ${alreadyCanonical}`);
  console.log(`Legacy annotated: ${annotated} (deactivated in main orgs: ${deactivated})`);
  if (skippedAmbiguous.length) {
    console.log(`Ambiguous (skipped, need manual review): ${skippedAmbiguous.length}`);
    skippedAmbiguous.forEach((s) => console.log(`  - ${s}`));
  }
  if (unmatched.length) {
    console.log(`No FM match (left untouched): ${unmatched.length}`);
    unmatched.forEach((s) => console.log(`  - ${s}`));
  }
}

main().catch((err) => {
  console.error("Reconcile failed:", err);
  process.exit(1);
});
