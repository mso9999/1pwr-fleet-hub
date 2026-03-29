import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseBodyMarks, type BodyMark } from "@/lib/inspection-body-diagram";
import { failEvidenceMessage } from "@/lib/inspection-validation";

type ParsedRow = {
  category: string;
  item: string;
  rating: string;
  note: string;
  bodyMarks?: BodyMark[];
};

function parseItems(raw: unknown): ParsedRow[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ParsedRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const o = row as Record<string, unknown>;
    if (typeof o.category !== "string" || typeof o.item !== "string") return null;
    const rating = typeof o.rating === "string" ? o.rating : "pass";
    if (!["pass", "caution", "fail"].includes(rating)) return null;
    const base: ParsedRow = {
      category: o.category,
      item: o.item,
      rating,
      note: typeof o.note === "string" ? o.note : "",
    };
    if (o.bodyMarks !== undefined) {
      const bm = parseBodyMarks(o.bodyMarks);
      if (bm === undefined) return null;
      if (bm.length > 0) base.bodyMarks = bm;
    }
    out.push(base);
  }
  return out;
}

export function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return (async () => {
    const { id } = await context.params;
    const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
    const db = getDb();
    const row = db
      .prepare(
        `
      SELECT i.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
      FROM inspections i
      JOIN vehicles v ON i.vehicle_id = v.id
      WHERE i.id = ? AND i.organization_id = ?
    `
      )
      .get(id, org) as Record<string, unknown> | undefined;
    if (!row) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...row,
      items: typeof row.items === "string" ? JSON.parse(row.items as string) : row.items,
    });
  })();
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  const db = getDb();
  const body = await request.json();
  const org = body.organizationId || "1pwr_lesotho";

  const existing = db
    .prepare("SELECT * FROM inspections WHERE id = ? AND organization_id = ?")
    .get(id, org) as Record<string, unknown> | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }

  let finalItems: Array<{ category: string; item: string; rating: string; note: string }>;
  if (body.items !== undefined) {
    const parsed = parseItems(body.items);
    if (parsed === null || parsed.length === 0) {
      return NextResponse.json({ error: "Invalid or empty items array" }, { status: 400 });
    }
    finalItems = parsed;
  } else {
    try {
      finalItems = JSON.parse((existing.items as string) || "[]") as typeof finalItems;
    } catch {
      return NextResponse.json({ error: "Stored inspection items are invalid" }, { status: 500 });
    }
    if (!Array.isArray(finalItems) || finalItems.length === 0) {
      return NextResponse.json({ error: "Stored items empty; send items in body to repair" }, { status: 400 });
    }
  }

  const evidenceErr = failEvidenceMessage(finalItems, {});
  if (evidenceErr) {
    return NextResponse.json({ error: evidenceErr }, { status: 400 });
  }

  const vehicleId = typeof body.vehicleId === "string" ? body.vehicleId : (existing.vehicle_id as string);
  const vcheck = db
    .prepare("SELECT id FROM vehicles WHERE id = ? AND organization_id = ?")
    .get(vehicleId, org);
  if (!vcheck) {
    return NextResponse.json({ error: "Vehicle not found for this organization" }, { status: 400 });
  }

  const inspectorName =
    typeof body.inspectorName === "string" ? body.inspectorName : (existing.inspector_name as string);
  const type = typeof body.type === "string" ? body.type : (existing.type as string);

  const hasFailure = finalItems.some((item) => item.rating === "fail");
  const overallPass = !hasFailure;
  const now = new Date().toISOString();

  const itemsJson = JSON.stringify(finalItems);

  db.prepare(
    `
    UPDATE inspections SET
      vehicle_id = ?,
      inspector_name = ?,
      type = ?,
      items = ?,
      overall_pass = ?,
      updated_at = ?
    WHERE id = ? AND organization_id = ?
  `
  ).run(vehicleId, inspectorName, type, itemsJson, overallPass ? 1 : 0, now, id, org);

  const row = db
    .prepare(
      `
    SELECT i.*, v.code as vehicle_code, v.make as vehicle_make, v.model as vehicle_model
    FROM inspections i
    JOIN vehicles v ON i.vehicle_id = v.id
    WHERE i.id = ?
  `
    )
    .get(id) as Record<string, unknown>;

  return NextResponse.json({
    ...row,
    items: typeof row.items === "string" ? JSON.parse(row.items as string) : row.items,
  });
}

export function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return (async () => {
    const { id } = await context.params;
    const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
    const db = getDb();
    const row = db
      .prepare("SELECT id FROM inspections WHERE id = ? AND organization_id = ?")
      .get(id, org) as { id: string } | undefined;
    if (!row) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }
    db.prepare("DELETE FROM inspections WHERE id = ? AND organization_id = ?").run(id, org);
    return NextResponse.json({ ok: true, id });
  })();
}
