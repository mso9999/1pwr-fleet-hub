import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser, canViewEhsApprovedDriversRegister } from "@/lib/server-auth";
import { normalizeEmail } from "@/lib/vehicle-check-approvers";
import {
  EHS_DRIVER_MEDIA_ENTITY,
  EHS_OPERATOR_AUTH_MEDIA_ENTITY,
} from "@/lib/ehs-driver-media";
import {
  evaluateAllCategories,
  type EhsDriverRow,
  type EhsOperatorAuthorization,
} from "@/lib/ehs-approved-drivers";
import type { OperatorCategoryCode } from "@/lib/ehs-operator-categories";

/**
 * GET /api/ehs-approved-drivers/lookup?org=&email=
 * Returns the operator record (if any) plus a per-category readiness map so callers can
 * decide whether the user is cleared for a specific D018 category (fleet_vehicle_onroad
 * by default, but heavy vehicles / plant / machining are all queryable).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user || !canViewEhsApprovedDriversRegister(user.role, user.department)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const org = sp.get("org") || "1pwr_lesotho";
  const email = normalizeEmail(sp.get("email") || "");
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM ehs_approved_drivers WHERE organization_id = ? AND lower(trim(email)) = ?`
    )
    .get(org, email) as EhsDriverRow | undefined;
  if (!row) {
    return NextResponse.json({
      found: false,
      fullyCompliant: false,
      categoryReadiness: {} as Record<OperatorCategoryCode, boolean>,
      email,
    });
  }

  const licenceCnt = db
    .prepare(
      `SELECT COUNT(*) AS c FROM media_attachments WHERE entity_type = ? AND entity_id = ?`
    )
    .get(EHS_DRIVER_MEDIA_ENTITY, row.id) as { c: number };
  const licenceMediaCount = Number(licenceCnt?.c ?? 0);

  const authorizations = db
    .prepare(
      `SELECT * FROM ehs_operator_authorizations WHERE operator_id = ? ORDER BY category_code`
    )
    .all(row.id) as EhsOperatorAuthorization[];

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
    for (const r of rows) trainingMediaCountByAuthId[r.id] = Number(r.c);
  }

  const perCategory = evaluateAllCategories({
    row,
    authorizations,
    licenceMediaCount,
    trainingMediaCountByAuthId,
  });

  const categoryReadiness: Record<string, boolean> = {};
  for (const [code, res] of Object.entries(perCategory)) {
    categoryReadiness[code] = res.ready;
  }

  return NextResponse.json({
    found: true,
    fullyCompliant: categoryReadiness["fleet_vehicle_onroad"] ?? false,
    categoryReadiness,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    id: row.id,
  });
}
