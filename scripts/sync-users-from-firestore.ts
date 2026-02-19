/**
 * Sync fleet-department users from the PR system Firestore into Fleet Hub SQLite.
 * Usage: npx tsx scripts/sync-users-from-firestore.ts
 */

import * as admin from "firebase-admin";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const SERVICE_ACCOUNT_PATH = path.resolve("/Users/mattmso/Dropbox/AI Projects/PR 25 NOV/firebase-service-account.json");
const DB_PATH = path.join(process.cwd(), "fleet-hub.db");

interface FirestoreUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  department?: string;
  organization?: string;
  organizationId?: string;
  isActive?: boolean;
  permissionLevel?: number;
}

function mapOrgId(org: string): string {
  const normalized = (org || "").toLowerCase().replace(/\s+/g, "_");
  if (normalized.includes("benin") || normalized === "1pwr_benin") return "1pwr_benin";
  if (normalized.includes("zambia") || normalized === "1pwr_zambia") return "1pwr_zambia";
  return "1pwr_lesotho";
}

function mapFleetRole(prRole: string, department: string, permLevel: number): string {
  const dept = (department || "").toLowerCase();
  const role = (prRole || "").toLowerCase();

  if (permLevel === 1 || role === "admin") return "admin";
  if (dept.includes("fleet") && (role.includes("manager") || permLevel <= 2)) return "manager";
  if (dept.includes("fleet") && (role.includes("lead") || role.includes("proc"))) return "fleet_lead";
  if (dept.includes("fleet") && role.includes("mechanic")) return "mechanic";
  if (dept.includes("fleet")) return "driver";
  if (permLevel <= 3) return "manager";
  return "driver";
}

async function main(): Promise<void> {
  console.log("=== Sync Users from PR Firestore ===\n");

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`Service account not found: ${SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const firestore = admin.firestore();

  // Fetch all users from Firestore
  console.log("Fetching users from Firestore...");
  const usersSnap = await firestore.collection("users").get();
  const allUsers: FirestoreUser[] = [];

  usersSnap.forEach((doc) => {
    const data = doc.data();
    allUsers.push({
      id: doc.id,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      department: data.department,
      organization: data.organization,
      organizationId: data.organizationId,
      isActive: data.isActive,
      permissionLevel: data.permissionLevel,
    });
  });

  console.log(`Found ${allUsers.length} total users in Firestore`);

  // Log departments to help identify fleet users
  const depts = new Map<string, number>();
  for (const u of allUsers) {
    const d = u.department || "(none)";
    depts.set(d, (depts.get(d) || 0) + 1);
  }
  console.log("\nDepartments:");
  for (const [dept, count] of Array.from(depts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${dept}: ${count}`);
  }

  // Open SQLite
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;

  const upsert = db.prepare(`
    INSERT INTO users (id, firebase_uid, email, first_name, last_name, name, role, department, organization_id, permission_level, is_active, created_at, updated_at)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(firebase_uid) DO UPDATE SET
      email = excluded.email,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      name = excluded.name,
      role = excluded.role,
      department = excluded.department,
      organization_id = excluded.organization_id,
      permission_level = excluded.permission_level,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);

  const emailUpsert = db.prepare(`
    INSERT INTO users (id, firebase_uid, email, first_name, last_name, name, role, department, organization_id, permission_level, is_active, created_at, updated_at)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      firebase_uid = excluded.firebase_uid,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      name = excluded.name,
      role = excluded.role,
      department = excluded.department,
      organization_id = excluded.organization_id,
      permission_level = excluded.permission_level,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);

  console.log("\nSyncing users to Fleet Hub...");

  for (const u of allUsers) {
    if (!u.email) continue;

    const orgId = mapOrgId(u.organization || "");
    const fleetRole = mapFleetRole(u.role || "", u.department || "", u.permissionLevel || 5);
    const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;

    try {
      // Try firebase_uid-based upsert first
      const result = upsert.run(
        u.id,
        u.email,
        u.firstName || "",
        u.lastName || "",
        name,
        fleetRole,
        u.department || "",
        orgId,
        u.permissionLevel || 5,
        u.isActive !== false ? 1 : 0,
        now,
        now
      );
      if (result.changes > 0) {
        inserted++;
        console.log(`  UPSERT: ${name.padEnd(25)} ${fleetRole.padEnd(12)} ${orgId} (${u.department || "-"})`);
      }
    } catch {
      // Fallback to email-based upsert if firebase_uid conflict with different record
      try {
        emailUpsert.run(
          u.id,
          u.email,
          u.firstName || "",
          u.lastName || "",
          name,
          fleetRole,
          u.department || "",
          orgId,
          u.permissionLevel || 5,
          u.isActive !== false ? 1 : 0,
          now,
          now
        );
        updated++;
        console.log(`  UPDATE: ${name.padEnd(25)} ${fleetRole.padEnd(12)} ${orgId}`);
      } catch (err2) {
        console.log(`  SKIP: ${u.email} — ${err2 instanceof Error ? err2.message : "unknown error"}`);
      }
    }
  }

  // Print summary
  const usersByOrg = db.prepare(`
    SELECT organization_id, role, COUNT(*) as cnt 
    FROM users 
    GROUP BY organization_id, role 
    ORDER BY organization_id, cnt DESC
  `).all() as Array<{ organization_id: string; role: string; cnt: number }>;

  console.log(`\n=== Sync Complete ===`);
  console.log(`  Processed: ${inserted + updated}`);
  console.log(`  New: ${inserted}  Updated: ${updated}`);
  console.log(`\nUsers by org and role:`);
  for (const r of usersByOrg) {
    console.log(`  ${r.organization_id.padEnd(16)} ${r.role.padEnd(12)} ${r.cnt}`);
  }

  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
