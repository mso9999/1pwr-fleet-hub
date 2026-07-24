import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import {
  verifyFleetUser,
  canViewEhsApprovedDriversRegister,
  canManageEhsApprovedDrivers,
} from "@/lib/server-auth";
import { normalizeEmail } from "@/lib/vehicle-check-approvers";
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
import { OPERATOR_CATEGORIES } from "@/lib/ehs-operator-categories";
import { recordMutation, actorFrom } from "@/lib/record-mutation-log";
import type { AuthFailure } from "@/lib/server-auth";

function explainAuthFailure(reason: AuthFailure | undefined): string {
  switch (reason) {
    case "no_bearer":
      return "Sign in to continue.";
    case "bad_token":
      return "Your session has expired — sign out and sign in again.";
    case "deactivated":
      return "Your Fleet Hub account is deactivated. Contact an admin to re-enable it.";
    case "auth_unconfigured":
      return "Fleet Hub authentication is not configured on this server. Contact IT.";
    default:
      return "Unauthorized";
  }
}

type RowWithMeta = Record<string, unknown> & {
  license_media_count: number;
  fully_compliant: boolean;
  attestation: {
    by: string;
    at: string | null;
    isFresh: boolean;
  };
  authorizations: Array<
    EhsOperatorAuthorization & {
      training_media_count: number;
      ready: boolean;
      grant_is_trainer: boolean;
    }
  >;
  category_readiness: Record<string, boolean>;
};

function buildAuthorizationStubsIfMissing(
  db: ReturnType<typeof getDb>,
  operatorId: string
): EhsOperatorAuthorization[] {
  // Ensure every known category has a row (grant='none' by default) so the UI can render
  // the matrix without extra upsert logic and so evaluators don't have to guess defaults.
  const existing = db
    .prepare(
      `SELECT * FROM ehs_operator_authorizations WHERE operator_id = ?`
    )
    .all(operatorId) as EhsOperatorAuthorization[];
  const byCode = new Map(existing.map((r) => [r.category_code, r]));

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO ehs_operator_authorizations
       (id, operator_id, category_code, grant, notes, created_at, updated_at)
     VALUES (?, ?, ?, 'none', '', ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const meta of OPERATOR_CATEGORIES) {
      if (!byCode.has(meta.code)) {
        const id = uuidv4();
        insert.run(id, operatorId, meta.code, now, now);
      }
    }
  });
  if (byCode.size < OPERATOR_CATEGORIES.length) tx();

  return db
    .prepare(
      `SELECT * FROM ehs_operator_authorizations WHERE operator_id = ? ORDER BY category_code`
    )
    .all(operatorId) as EhsOperatorAuthorization[];
}

function rowWithMeta(
  db: ReturnType<typeof getDb>,
  row: Record<string, unknown>
): RowWithMeta {
  const r = row as unknown as EhsDriverRow;

  const licenceCnt = db
    .prepare(
      `SELECT COUNT(*) AS c FROM media_attachments WHERE entity_type = ? AND entity_id = ?`
    )
    .get(EHS_DRIVER_MEDIA_ENTITY, r.id) as { c: number };
  const licenceMediaCount = Number(licenceCnt?.c ?? 0);

  const authorizations = buildAuthorizationStubsIfMissing(db, r.id);

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

  const defaultReady = perCategory["fleet_vehicle_onroad"]?.ready ?? false;

  return {
    ...row,
    license_media_count: licenceMediaCount,
    fully_compliant: defaultReady,
    attestation: {
      by: r.attested_by_name || r.attested_by_id || "",
      at: r.attested_at,
      isFresh: isAttestationFresh(r),
    },
    authorizations: perAuth,
    category_readiness: categoryReadiness,
  };
}

/**
 * GET /api/ehs-approved-drivers?org=
 * List operator records for the org. Visible to every signed-in user (read-only).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user, reason } = await verifyFleetUser(request);
  if (!user) {
    return NextResponse.json(
      { error: explainAuthFailure(reason), reason },
      { status: 401 }
    );
  }
  if (!canViewEhsApprovedDriversRegister(user.role, user.department)) {
    return NextResponse.json({ error: "You don't have access to this register." }, { status: 403 });
  }
  const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM ehs_approved_drivers WHERE organization_id = ? ORDER BY display_name COLLATE NOCASE, email COLLATE NOCASE`
    )
    .all(org) as Array<Record<string, unknown>>;
  const drivers = rows.map((row) => rowWithMeta(db, row));
  return NextResponse.json({ drivers });
}

/**
 * POST /api/ehs-approved-drivers
 * Add an employee from the HR directory to the register (EHS managers only).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user, reason } = await verifyFleetUser(request);
  if (!user) {
    return NextResponse.json(
      { error: explainAuthFailure(reason), reason },
      { status: 401 }
    );
  }
  if (!canManageEhsApprovedDrivers(user.role, user.department)) {
    return NextResponse.json(
      {
        error:
          "You don't have permission to add approved drivers. This is limited to EHS department users, ehs_manager, admin, or superadmin roles.",
      },
      { status: 403 }
    );
  }
  const body = (await request.json()) as {
    organizationId?: string;
    email?: string;
    displayName?: string;
    hrUserId?: number | null;
    hrEmployeeId?: string;
  };
  const organizationId = body.organizationId || "1pwr_lesotho";
  const email = normalizeEmail(body.email || "");
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  const displayName = (body.displayName || "").trim() || email;
  const now = new Date().toISOString();
  const id = uuidv4();
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO ehs_approved_drivers (
        id, organization_id, hr_user_id, hr_employee_id, email, display_name,
        license_valid_from, license_expiry, license_originally_issued,
        written_test_passed_at, road_test_passed_at, eye_test_passed_at, reaction_test_passed_at,
        status, notes, created_at, updated_at, updated_by_id, updated_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, '', '', '', '', '', '', '', 'active', '', ?, ?, ?, ?)`
    ).run(
      id,
      organizationId,
      body.hrUserId ?? null,
      (body.hrEmployeeId || "").trim(),
      email,
      displayName,
      now,
      now,
      user.id,
      user.name || user.email
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE constraint failed/i.test(msg)) {
      return NextResponse.json(
        { error: "This email is already on the approved-driver register for this organization." },
        { status: 409 }
      );
    }
    throw e;
  }
  // Seed authorization rows for every known category so the matrix renders immediately.
  buildAuthorizationStubsIfMissing(db, id);
  const row = db.prepare("SELECT * FROM ehs_approved_drivers WHERE id = ?").get(id) as Record<string, unknown>;

  recordMutation(db, {
    entityType: "ehs_approved_driver",
    entityId: id,
    organizationId,
    action: "create",
    actor: actorFrom(user),
    before: null,
    after: {
      display_name: displayName,
      email,
      hr_user_id: body.hrUserId ?? null,
      hr_employee_id: body.hrEmployeeId || "",
      status: "active",
    },
    reason: "Added from HR directory",
  });

  return NextResponse.json(rowWithMeta(db, row), { status: 201 });
}
