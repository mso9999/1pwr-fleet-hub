import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  getVerifiedFleetUser,
  canManageEhsApprovedDrivers,
  canViewEhsApprovedDriversRegister,
} from "@/lib/server-auth";
import {
  EHS_DRIVER_MEDIA_ENTITY,
  EHS_OPERATOR_AUTH_MEDIA_ENTITY,
} from "@/lib/ehs-driver-media";
import {
  evaluateAllCategories,
  isAttestationFresh,
  type EhsDriverRow,
  type EhsOperatorAuthorization,
} from "@/lib/ehs-approved-drivers";
import { isAssessmentResult } from "@/lib/ehs-operator-categories";

function countLicenceMedia(db: ReturnType<typeof getDb>, operatorId: string): number {
  const cnt = db
    .prepare(
      `SELECT COUNT(*) AS c FROM media_attachments WHERE entity_type = ? AND entity_id = ?`
    )
    .get(EHS_DRIVER_MEDIA_ENTITY, operatorId) as { c: number };
  return Number(cnt?.c ?? 0);
}

function rowWithMeta(db: ReturnType<typeof getDb>, row: Record<string, unknown>): Record<string, unknown> {
  const r = row as unknown as EhsDriverRow;
  const licenceMediaCount = countLicenceMedia(db, r.id);

  const authorizations = db
    .prepare(
      `SELECT * FROM ehs_operator_authorizations WHERE operator_id = ? ORDER BY category_code`
    )
    .all(r.id) as EhsOperatorAuthorization[];

  const trainingMediaCountByAuthId: Record<string, number> = {};
  if (authorizations.length > 0) {
    const ids = authorizations.map((a) => a.id);
    const placeholders = ids.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT entity_id as id, COUNT(*) as c
         FROM media_attachments
         WHERE entity_type = ? AND entity_id IN (${placeholders})
         GROUP BY entity_id`
      )
      .all(EHS_OPERATOR_AUTH_MEDIA_ENTITY, ...ids) as Array<{ id: string; c: number }>;
    for (const row of rows) trainingMediaCountByAuthId[row.id] = Number(row.c);
  }

  const perCategory = evaluateAllCategories({
    row: r,
    authorizations,
    licenceMediaCount,
    trainingMediaCountByAuthId,
  });

  const categoryReadiness: Record<string, boolean> = {};
  const perAuth = authorizations.map((a) => {
    const ready = perCategory[a.category_code as keyof typeof perCategory]?.ready ?? false;
    categoryReadiness[a.category_code] = ready;
    return {
      ...a,
      training_media_count: trainingMediaCountByAuthId[a.id] ?? 0,
      ready,
      grant_is_trainer: a.grant === "trainer",
    };
  });

  return {
    ...row,
    license_media_count: licenceMediaCount,
    fully_compliant: perCategory["fleet_vehicle_onroad"]?.ready ?? false,
    attestation: {
      by: r.attested_by_name || r.attested_by_id || "",
      at: r.attested_at,
      isFresh: isAttestationFresh(r),
    },
    authorizations: perAuth,
    category_readiness: categoryReadiness,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canViewEhsApprovedDriversRegister(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const row = db.prepare("SELECT * FROM ehs_approved_drivers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rowWithMeta(db, row));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canManageEhsApprovedDrivers(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const existing = db.prepare("SELECT * FROM ehs_approved_drivers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as Record<string, unknown>;
  const now = new Date().toISOString();

  // Plain string / date fields.
  const stringMap: Record<string, string> = {
    displayName: "display_name",
    hrUserId: "hr_user_id",
    hrEmployeeId: "hr_employee_id",
    licenseValidFrom: "license_valid_from",
    licenseExpiry: "license_expiry",
    writtenTestPassedAt: "written_test_passed_at",
    roadTestPassedAt: "road_test_passed_at",
    eyeTestPassedAt: "eye_test_passed_at",
    reactionTestPassedAt: "reaction_test_passed_at",
    status: "status",
    notes: "notes",
  };

  // Tri-state assessments; each value must be 'pass' | 'fail' | 'pending'.
  const assessmentMap: Record<string, string> = {
    visionResult: "vision_result",
    hearingResult: "hearing_result",
    reactionResult: "reaction_result",
    writtenOffroadResult: "written_offroad_result",
    practicalResult: "practical_result",
  };

  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [jsKey, col] of Object.entries(stringMap)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${col} = ?`);
      if (jsKey === "hrUserId") {
        values.push(body[jsKey] === null ? null : Number(body[jsKey]));
      } else {
        values.push(body[jsKey]);
      }
    }
  }

  for (const [jsKey, col] of Object.entries(assessmentMap)) {
    if (body[jsKey] !== undefined) {
      const v = String(body[jsKey]);
      if (!isAssessmentResult(v)) {
        return NextResponse.json(
          { error: `${jsKey} must be 'pass', 'fail', or 'pending'` },
          { status: 400 }
        );
      }
      fields.push(`${col} = ?`);
      values.push(v);
    }
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Any edit clears the attestation; EHS must re-tick and re-save from the card.
  fields.push(
    "attested_by_id = ?",
    "attested_by_name = ?",
    "attested_at = NULL",
    "updated_at = ?",
    "updated_by_id = ?",
    "updated_by_name = ?"
  );
  values.push("", "", now, user.id, user.name || user.email);
  values.push(id);

  db.prepare(`UPDATE ehs_approved_drivers SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  const row = db.prepare("SELECT * FROM ehs_approved_drivers WHERE id = ?").get(id) as Record<string, unknown>;
  return NextResponse.json(rowWithMeta(db, row));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const user = await getVerifiedFleetUser(request);
  if (!user || !canManageEhsApprovedDrivers(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const r = db.prepare("DELETE FROM ehs_approved_drivers WHERE id = ?").run(id);
  if (r.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
