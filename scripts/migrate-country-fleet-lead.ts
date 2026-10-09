#!/usr/bin/env tsx
/**
 * One-shot data migration for the country-scoped fleet lead (2026-10-09).
 *
 * Production stop-gap being undone: Eduardo (1pwr_zambia) was set to role
 * fleet_lead so he could allocate vehicles, which removed his mission-approval
 * rights. With user_fleet_lead_scopes, a manager can also be fleet lead of
 * exactly their own country:
 *
 *   eduardo@1pwrafrica.com  role fleet_lead → manager (only if currently fleet_lead
 *                           or already manager; any other role is left alone),
 *                           + fleet-lead scope 1pwr_zambia
 *   kelebone@1pwrafrica.com role unchanged (fleet_lead), + fleet-lead scope 1pwr_lesotho
 *
 * Each change writes a record_mutation_log row (entity_type 'user'). Idempotent.
 * Opens the DB directly (not via src/lib/db getDb) so it does not run the app's
 * migration chain; it creates user_fleet_lead_scopes with the same DDL if missing.
 * NOT run automatically. Default is dry-run; pass --apply to write.
 *
 * Usage:
 *   DB_PATH=/path/to/fleet-hub.db npx tsx scripts/migrate-country-fleet-lead.ts           # dry-run
 *   DB_PATH=/path/to/fleet-hub.db npx tsx scripts/migrate-country-fleet-lead.ts --apply   # write
 */

import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "fleet-hub.db");
const APPLY = process.argv.includes("--apply");
const REASON = "country_fleet_lead_migration";
const ACTOR = { id: "system", name: "migrate-country-fleet-lead", role: "system" };

interface Target {
  email: string;
  scopeOrg: string;
  /** Set role to this when the current role is one of fromRoles. */
  role?: { to: string; fromRoles: string[] };
}

const TARGETS: Target[] = [
  { email: "eduardo@1pwrafrica.com", scopeOrg: "1pwr_zambia", role: { to: "manager", fromRoles: ["fleet_lead"] } },
  { email: "kelebone@1pwrafrica.com", scopeOrg: "1pwr_lesotho" },
];

interface UserRow {
  id: string;
  email: string;
  role: string;
  organization_id: string;
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

function findUser(db: Database.Database, email: string): UserRow | undefined {
  return db
    .prepare(
      `SELECT id, email, role, IFNULL(organization_id, '') AS organization_id
       FROM users WHERE lower(trim(email)) = ?`
    )
    .get(email.toLowerCase()) as UserRow | undefined;
}

function scopesOf(db: Database.Database, userId: string): string[] {
  if (!tableExists(db, "user_fleet_lead_scopes")) return [];
  return (
    db
      .prepare("SELECT organization_id FROM user_fleet_lead_scopes WHERE user_id = ? ORDER BY organization_id")
      .all(userId) as Array<{ organization_id: string }>
  ).map((r) => r.organization_id);
}

function snapshot(db: Database.Database, label: string): void {
  console.log(`\n${label}:`);
  for (const t of TARGETS) {
    const u = findUser(db, t.email);
    if (!u) {
      console.log(`  ${t.email}: (no users row)`);
      continue;
    }
    const scopes = scopesOf(db, u.id);
    console.log(
      `  ${u.email}: role=${u.role} org=${u.organization_id || "(none)"} fleet_lead_scopes=[${scopes.join(", ")}]`
    );
  }
}

function logMutation(
  db: Database.Database,
  userId: string,
  organizationId: string,
  action: "update" | "authorization",
  before: Record<string, unknown>,
  after: Record<string, unknown>
): void {
  db.prepare(
    `INSERT INTO record_mutation_log (
      id, entity_type, entity_id, organization_id, action,
      actor_id, actor_name, actor_role, actor_department,
      before_json, after_json, reason, created_at
    ) VALUES (?, 'user', ?, ?, ?, ?, ?, ?, '', ?, ?, ?, datetime('now'))`
  ).run(
    randomUUID(),
    userId,
    organizationId,
    action,
    ACTOR.id,
    ACTOR.name,
    ACTOR.role,
    JSON.stringify(before),
    JSON.stringify(after),
    REASON
  );
}

function main(): void {
  console.log(`DB_PATH: ${DB_PATH}`);
  console.log(`Mode:    ${APPLY ? "APPLY (will write)" : "DRY-RUN (no writes; pass --apply to change)"}`);
  if (!fs.existsSync(DB_PATH) || fs.statSync(DB_PATH).size === 0) {
    console.error("ABORT: DB_PATH does not exist or is empty. Wrong database?");
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  for (const t of ["users", "organizations", "record_mutation_log"]) {
    if (!tableExists(db, t)) {
      console.error(`ABORT: no \`${t}\` table in this DB. Wrong database?`);
      process.exit(1);
    }
  }
  const hasScopeTable = tableExists(db, "user_fleet_lead_scopes");
  console.log(`user_fleet_lead_scopes present: ${hasScopeTable}${hasScopeTable ? "" : " (will be created)"}`);

  snapshot(db, "Before");

  type Step = () => void;
  const steps: Step[] = [];
  const plan: string[] = [];
  for (const t of TARGETS) {
    const u = findUser(db, t.email);
    if (!u) {
      plan.push(`SKIP ${t.email}: no users row`);
      continue;
    }
    if (!db.prepare("SELECT 1 FROM organizations WHERE id = ?").get(t.scopeOrg)) {
      plan.push(`SKIP ${t.email}: organization ${t.scopeOrg} not found`);
      continue;
    }
    if (u.organization_id !== t.scopeOrg) {
      plan.push(`NOTE ${t.email}: home org is ${u.organization_id || "(none)"}, scope will be ${t.scopeOrg}`);
    }

    const current = (u.role || "").toLowerCase();
    if (t.role && current !== t.role.to) {
      if (t.role.fromRoles.includes(current)) {
        plan.push(`ROLE  ${t.email}: ${u.role} → ${t.role.to}`);
        const to = t.role.to;
        steps.push(() => {
          db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(to, u.id);
          logMutation(db, u.id, u.organization_id, "update", { role: u.role }, { role: to });
        });
      } else {
        plan.push(`KEEP  ${t.email}: role ${u.role} is not ${t.role.fromRoles.join("/")}; left unchanged`);
      }
    }

    if (scopesOf(db, u.id).includes(t.scopeOrg)) {
      plan.push(`OK    ${t.email}: already fleet lead for ${t.scopeOrg}`);
    } else {
      plan.push(`SCOPE ${t.email}: + fleet lead for ${t.scopeOrg}`);
      steps.push(() => {
        db.prepare(
          "INSERT OR IGNORE INTO user_fleet_lead_scopes (user_id, organization_id, granted_by) VALUES (?, ?, ?)"
        ).run(u.id, t.scopeOrg, ACTOR.name);
        logMutation(db, u.id, t.scopeOrg, "authorization", { fleetLeadScope: null }, { fleetLeadScope: t.scopeOrg });
      });
    }
  }

  console.log("\nPlan:");
  for (const line of plan) console.log(`  ${line}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN complete (${steps.length} change(s) planned). Re-run with --apply to write.`);
    db.close();
    return;
  }

  db.transaction(() => {
    // Same DDL as migrateFleetLeadScopes in src/lib/db.ts.
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_fleet_lead_scopes (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL,
        granted_by TEXT NOT NULL DEFAULT '',
        granted_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, organization_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_fleet_lead_scopes_org ON user_fleet_lead_scopes(organization_id);
    `);
    for (const step of steps) step();
  })();

  snapshot(db, "After");
  db.close();
  console.log(`\nApplied ${steps.length} change(s). No restart needed (users are read per request).`);
}

main();
