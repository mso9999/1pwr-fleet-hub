/**
 * Write HR job-title fleet roles onto users.role.
 * Pull-only: Fleet never writes back to HR. If HR is unreachable, roles stay as they are.
 */
import type Database from "better-sqlite3";
import { getHrEmployeeByEmail } from "@/lib/hr-approval-roles";
import { fetchHrEmployeeDirectory } from "@/lib/hr-directory-client";
import {
  planHrFleetRoleUpdates,
  type HrFleetRoleChange,
  type HrFleetRoleEmployee,
} from "@/lib/hr-fleet-role";
import { recordMutation } from "@/lib/record-mutation-log";

const ACTOR = { id: "system", name: "HR fleet role sync", role: "system", department: "" };

interface UserRow {
  id: string;
  email: string;
  role: string;
  organization_id: string;
}

function loadUsers(db: Database.Database): UserRow[] {
  return db
    .prepare(
      `SELECT id, email, role, IFNULL(organization_id, '') AS organization_id
       FROM users
       WHERE email IS NOT NULL AND trim(email) != ''`,
    )
    .all() as UserRow[];
}

function applyChanges(db: Database.Database, users: UserRow[], changes: HrFleetRoleChange[]): HrFleetRoleChange[] {
  const byEmail = new Map(users.map((user) => [user.email.trim().toLowerCase(), user]));
  const update = db.prepare(
    `UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ? AND lower(role) = lower(?)`,
  );
  const applied: HrFleetRoleChange[] = [];
  const tx = db.transaction(() => {
    for (const change of changes) {
      const user = byEmail.get(change.email);
      if (!user) continue;
      const result = update.run(change.to, user.id, change.from);
      if (result.changes !== 1) continue;
      recordMutation(db, {
        entityType: "user",
        entityId: user.id,
        organizationId: user.organization_id,
        action: "update",
        actor: ACTOR,
        before: { role: change.from },
        after: { role: change.to },
        reason: "hr_position_title",
      });
      applied.push(change);
    }
  });
  tx();
  return applied;
}

export function applyHrFleetRolePlan(
  db: Database.Database,
  employees: HrFleetRoleEmployee[],
): HrFleetRoleChange[] {
  const users = loadUsers(db);
  return applyChanges(db, users, planHrFleetRoleUpdates(users, employees));
}

/** Refresh every matched user from the HR directory. No-op when HR cannot be read. */
export async function syncFleetRolesFromHr(db: Database.Database): Promise<HrFleetRoleChange[]> {
  const directory = await fetchHrEmployeeDirectory();
  if (!directory.ok || !directory.employees) return [];
  const employees = directory.employees.map((employee) => ({
    email: employee.email,
    title: employee.current_position_title,
    department: employee.department,
  }));
  return applyHrFleetRolePlan(db, employees);
}

/** Refresh the signed-in user from the cached HR directory. */
export async function syncFleetRoleForEmail(
  db: Database.Database,
  email: string,
): Promise<HrFleetRoleChange | null> {
  const employee = await getHrEmployeeByEmail(email);
  if (!employee) return null;
  const applied = applyHrFleetRolePlan(db, [
    {
      email: employee.email,
      title: employee.current_position_title,
      department: employee.department,
    },
  ]);
  return applied[0] ?? null;
}
