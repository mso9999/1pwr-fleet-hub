import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import {
  EHS_DRIVER_MEDIA_ENTITY,
  EHS_OPERATOR_AUTH_MEDIA_ENTITY,
} from "@/lib/ehs-driver-media";
import {
  evaluateOperatorCompliance,
  type EhsDriverRow,
  type EhsOperatorAuthorization,
} from "@/lib/ehs-approved-drivers";
import {
  DEFAULT_OPERATOR_CATEGORY,
  isKnownOperatorCategory,
  type OperatorCategoryCode,
} from "@/lib/ehs-operator-categories";

function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * GET /api/ehs-approved-drivers/options?org=&category=fleet_vehicle_onroad
 * &q=&page=&pageSize=
 *
 * Without `page`, returns every compliant operator (backward compatible with the
 * vehicle-check combobox). With `page` (1-based), returns a slice plus `total`
 * for paginated pickers (vehicle logistics, etc.).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getVerifiedFleetUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const org = sp.get("org") || "1pwr_lesotho";
  const categoryRaw = (sp.get("category") || "").trim();
  const category: OperatorCategoryCode = isKnownOperatorCategory(categoryRaw)
    ? categoryRaw
    : DEFAULT_OPERATOR_CATEGORY;

  const qRaw = (sp.get("q") || "").trim();
  const pageRaw = sp.get("page");
  const usePagination = pageRaw !== null && pageRaw !== "";
  const page = Math.max(1, Number.parseInt(pageRaw || "1", 10) || 1);
  const pageSizeRaw = Number.parseInt(sp.get("pageSize") || "25", 10) || 25;
  const pageSize = Math.min(100, Math.max(5, pageSizeRaw));

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM ehs_approved_drivers WHERE organization_id = ? ORDER BY display_name COLLATE NOCASE, email COLLATE NOCASE`
    )
    .all(org) as EhsDriverRow[];

  if (rows.length === 0) {
    if (usePagination) {
      return NextResponse.json({
        category,
        organizationId: org,
        options: [],
        total: 0,
        page: 1,
        pageSize,
      });
    }
    return NextResponse.json({ category, options: [] });
  }

  const operatorIds = rows.map((r) => r.id);
  const opPlaceholders = operatorIds.map(() => "?").join(", ");

  const authorizationRows = db
    .prepare(
      `SELECT * FROM ehs_operator_authorizations WHERE operator_id IN (${opPlaceholders}) ORDER BY category_code`
    )
    .all(...operatorIds) as EhsOperatorAuthorization[];
  const authorizationsByOperator = new Map<string, EhsOperatorAuthorization[]>();
  for (const a of authorizationRows) {
    const list = authorizationsByOperator.get(a.operator_id);
    if (list) list.push(a);
    else authorizationsByOperator.set(a.operator_id, [a]);
  }

  const licenceRows = db
    .prepare(
      `SELECT entity_id as id, COUNT(*) as c
         FROM media_attachments
         WHERE entity_type = ? AND entity_id IN (${opPlaceholders})
         GROUP BY entity_id`
    )
    .all(EHS_DRIVER_MEDIA_ENTITY, ...operatorIds) as Array<{ id: string; c: number }>;
  const licenceCountByOperator = new Map(licenceRows.map((r) => [r.id, Number(r.c)]));

  const trainingMediaCountByAuthId: Record<string, number> = {};
  if (authorizationRows.length > 0) {
    const authIds = authorizationRows.map((a) => a.id);
    const authPlaceholders = authIds.map(() => "?").join(", ");
    const mediaRows = db
      .prepare(
        `SELECT entity_id as id, COUNT(*) as c
           FROM media_attachments
           WHERE entity_type = ? AND entity_id IN (${authPlaceholders})
           GROUP BY entity_id`
      )
      .all(EHS_OPERATOR_AUTH_MEDIA_ENTITY, ...authIds) as Array<{ id: string; c: number }>;
    for (const r of mediaRows) trainingMediaCountByAuthId[r.id] = Number(r.c);
  }

  const options = rows
    .map((row) => ({
      row,
      result: evaluateOperatorCompliance({
        row,
        authorizations: authorizationsByOperator.get(row.id) ?? [],
        licenceMediaCount: licenceCountByOperator.get(row.id) ?? 0,
        trainingMediaCountByAuthId,
        category,
      }),
    }))
    .filter(({ result }) => result.ready)
    .map(({ row, result }) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name || row.email,
      hrEmployeeId: row.hr_employee_id || "",
      isTrainer: result.grant === "trainer",
    }));

  const nq = qRaw ? normalizeSearch(qRaw) : "";
  const filtered =
    nq.length > 0
      ? options.filter((o) => {
          const blob = normalizeSearch([o.displayName, o.email, o.hrEmployeeId].filter(Boolean).join(" "));
          return blob.includes(nq);
        })
      : options;

  if (!usePagination) {
    return NextResponse.json({ category, options: filtered });
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return NextResponse.json({
    category,
    organizationId: org,
    options: paged,
    total,
    page,
    pageSize,
  });
}
