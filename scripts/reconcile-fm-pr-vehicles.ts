#!/usr/bin/env npx tsx
/**
 * Compare FM SQLite vehicles vs PR Firestore referenceData_vehicles.
 * Reports matched, FM-only, PR-only, and id/code mismatches.
 *
 * Usage: npx tsx scripts/reconcile-fm-pr-vehicles.ts
 */

import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const SERVICE_ACCOUNT_CANDIDATES = [
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  path.join(__dirname, "..", "firebase-service-account.json"),
  path.join(__dirname, "..", "..", "PR 25 NOV", "firebase-service-account.json"),
  "/Users/mattmso/Dropbox/AI Projects/PR 25 NOV/firebase-service-account.json",
].filter(Boolean) as string[];

const DB_PATH = process.env.FM_DB_PATH || path.join(__dirname, "..", "fleet-hub.db");

interface FmVehicle {
  id: string;
  organization_id: string;
  code: string;
  license_plate: string;
  pr_firestore_id: string;
}

interface PrVehicle {
  docId: string;
  fmVehicleId: string;
  fleetCode: string;
  code: string;
  name: string;
  organizationId: string;
  registrationNumber: string;
  active: boolean;
  source: string;
  supersededBy?: string;
}

function normOrg(org: string): string {
  return (org || "").toLowerCase().replace(/\s+/g, "_");
}

function normCode(code: string): string {
  return (code || "").trim().toLowerCase();
}

function loadServiceAccount(): ServiceAccount {
  for (const p of SERVICE_ACCOUNT_CANDIDATES) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")) as ServiceAccount;
    }
  }
  throw new Error(
    `No Firebase service account found. Tried: ${SERVICE_ACCOUNT_CANDIDATES.join(", ")}`
  );
}

async function main(): Promise<void> {
  console.log("=== FM ↔ PR vehicle reconciliation ===\n");

  if (!fs.existsSync(DB_PATH)) {
    console.error(`FM database not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const fmVehicles = db
    .prepare(
      "SELECT id, organization_id, code, license_plate, pr_firestore_id FROM vehicles ORDER BY organization_id, code"
    )
    .all() as FmVehicle[];
  db.close();

  const app = initializeApp({ credential: cert(loadServiceAccount()) });
  const firestore = getFirestore(app);
  const snapshot = await firestore.collection("referenceData_vehicles").get();

  const prVehicles: PrVehicle[] = snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      docId: doc.id,
      fmVehicleId: String(d.fmVehicleId || ""),
      fleetCode: String(d.fleetCode || d.code || ""),
      code: String(d.code || ""),
      name: String(d.name || ""),
      organizationId: String(d.organizationId || ""),
      registrationNumber: String(d.registrationNumber || ""),
      active: d.active !== false,
      source: String(d.source || ""),
      supersededBy: d.supersededBy ? String(d.supersededBy) : undefined,
    };
  });

  console.log(`FM vehicles:  ${fmVehicles.length}`);
  console.log(`PR vehicles:  ${prVehicles.length}\n`);

  const prByFmId = new Map(prVehicles.filter((v) => v.fmVehicleId).map((v) => [v.fmVehicleId, v]));
  const prByOrgCode = new Map(
    prVehicles.map((v) => [`${normOrg(v.organizationId)}::${normCode(v.fleetCode || v.code || v.name)}`, v])
  );
  const prByDocId = new Map(prVehicles.map((v) => [v.docId, v]));

  const matched: string[] = [];
  const fmOnly: FmVehicle[] = [];
  const idMismatch: Array<{ fm: FmVehicle; pr: PrVehicle; reason: string }> = [];

  for (const fm of fmVehicles) {
    const byId = prByFmId.get(fm.id) || prByDocId.get(fm.id);
    const byLegacy =
      fm.pr_firestore_id && prByDocId.get(fm.pr_firestore_id);
    const byOrgCode = prByOrgCode.get(`${normOrg(fm.organization_id)}::${normCode(fm.code)}`);

    if (byId && byId.docId === fm.id) {
      matched.push(`${fm.organization_id} ${fm.code} → doc ${fm.id}`);
      continue;
    }

    if (byLegacy) {
      idMismatch.push({
        fm,
        pr: byLegacy,
        reason: `legacy PR doc ${fm.pr_firestore_id} should supersede to FM id ${fm.id}`,
      });
      continue;
    }

    if (byOrgCode && !byOrgCode.fmVehicleId) {
      idMismatch.push({
        fm,
        pr: byOrgCode,
        reason: `org+code match but PR doc ${byOrgCode.docId} lacks fmVehicleId`,
      });
      continue;
    }

    if (byOrgCode && byOrgCode.fmVehicleId && byOrgCode.fmVehicleId !== fm.id) {
      idMismatch.push({
        fm,
        pr: byOrgCode,
        reason: `org+code match but fmVehicleId ${byOrgCode.fmVehicleId} ≠ FM ${fm.id}`,
      });
      continue;
    }

    fmOnly.push(fm);
  }

  const fmIds = new Set(fmVehicles.map((v) => v.id));
  const fmOrgCodes = new Set(fmVehicles.map((v) => `${normOrg(v.organization_id)}::${normCode(v.code)}`));

  const prOnly = prVehicles.filter((pr) => {
    if (pr.supersededBy) return false;
    if (pr.fmVehicleId && fmIds.has(pr.fmVehicleId)) return false;
    if (fmOrgCodes.has(`${normOrg(pr.organizationId)}::${normCode(pr.fleetCode || pr.code || pr.name)}`)) {
      return false;
    }
    return true;
  });

  console.log(`Matched (FM id = Firestore doc id): ${matched.length}`);
  console.log(`FM only (not in PR mirror):       ${fmOnly.length}`);
  console.log(`PR only (no FM counterpart):      ${prOnly.length}`);
  console.log(`Id / mapping mismatches:        ${idMismatch.length}\n`);

  if (fmOnly.length > 0) {
    console.log("— FM only —");
    for (const v of fmOnly) {
      console.log(`  [${v.organization_id}] ${v.code} (${v.id}) reg=${v.license_plate || "—"}`);
    }
    console.log();
  }

  if (prOnly.length > 0) {
    console.log("— PR only —");
    for (const v of prOnly) {
      console.log(
        `  doc=${v.docId} org=${v.organizationId} code=${v.fleetCode || v.code || v.name} active=${v.active} source=${v.source || "—"}`
      );
    }
    console.log();
  }

  if (idMismatch.length > 0) {
    console.log("— Mismatches (need migration/sync) —");
    for (const m of idMismatch) {
      console.log(
        `  FM [${m.fm.organization_id}] ${m.fm.code} (${m.fm.id}) ↔ PR doc ${m.pr.docId}: ${m.reason}`
      );
    }
    console.log();
  }

  console.log("Run `npx tsx scripts/sync-vehicles-to-pr-firestore.ts` to push FM → PR.");
  console.log("Run PR `scripts/migrate-pr-vehicle-refs.ts` to remap purchaseRequests.vehicle fields.");
}

main().catch((err) => {
  console.error("Reconciliation failed:", err);
  process.exit(1);
});
