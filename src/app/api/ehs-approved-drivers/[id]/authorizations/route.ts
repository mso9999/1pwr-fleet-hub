import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import {
  getVerifiedFleetUser,
  canManageEhsApprovedDrivers,
} from "@/lib/server-auth";
import {
  isKnownOperatorCategory,
  isOperatorGrant,
} from "@/lib/ehs-operator-categories";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";

/**
 * POST /api/ehs-approved-drivers/[id]/authorizations
 * Body: { categoryCode: string, grant: 'none'|'approved'|'trainer', notes?: string }
 *
 * Upserts a single authorization row for the operator. Any change clears the
 * operator-level attestation (EHS must re-tick and re-save on the card).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canManageEhsApprovedDrivers(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    categoryCode?: string;
    grant?: string;
    notes?: string;
  };
  const categoryCode = String(body.categoryCode || "").trim();
  const grant = String(body.grant || "").trim();
  const notes = String(body.notes ?? "").trim();

  if (!isKnownOperatorCategory(categoryCode)) {
    return NextResponse.json({ error: `Unknown categoryCode '${categoryCode}'` }, { status: 400 });
  }
  if (!isOperatorGrant(grant)) {
    return NextResponse.json(
      { error: "grant must be 'none', 'approved', or 'trainer'" },
      { status: 400 }
    );
  }

  const db = getDb();
  const operator = db
    .prepare("SELECT id, organization_id FROM ehs_approved_drivers WHERE id = ?")
    .get(id) as { id: string; organization_id: string } | undefined;
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT * FROM ehs_operator_authorizations WHERE operator_id = ? AND category_code = ?`
    )
    .get(id, categoryCode) as
    | { id: string; grant: string; notes: string }
    | undefined;

  const tx = db.transaction(() => {
    if (existing) {
      db.prepare(
        `UPDATE ehs_operator_authorizations
           SET grant = ?, notes = ?, updated_at = ?
         WHERE id = ?`
      ).run(grant, notes, now, existing.id);
    } else {
      db.prepare(
        `INSERT INTO ehs_operator_authorizations
           (id, operator_id, category_code, grant, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), id, categoryCode, grant, notes, now, now);
    }

    // Clear attestation and stamp updated_at/updated_by on the parent operator record
    // so the UI shows the card as Draft until EHS re-attests.
    db.prepare(
      `UPDATE ehs_approved_drivers
         SET attested_by_id = '', attested_by_name = '', attested_at = NULL,
             updated_at = ?, updated_by_id = ?, updated_by_name = ?
       WHERE id = ?`
    ).run(now, user.id, user.name || user.email, id);
  });
  tx();

  const row = db
    .prepare(
      `SELECT * FROM ehs_operator_authorizations WHERE operator_id = ? AND category_code = ?`
    )
    .get(id, categoryCode);

  recordMutation(db, {
    entityType: "ehs_approved_driver",
    entityId: id,
    organizationId: String(operator.organization_id || ""),
    action: "authorization",
    actor: actorFrom(user),
    before: existing
      ? {
          category_code: categoryCode,
          grant: existing.grant,
          notes: existing.notes,
        }
      : { category_code: categoryCode, grant: "none", notes: "" },
    after: { category_code: categoryCode, grant, notes },
    reason: "Authorization updated",
  });

  return NextResponse.json(row);
}
