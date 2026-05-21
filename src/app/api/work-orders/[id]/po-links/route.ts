import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getVerifiedFleetUser } from "@/lib/server-auth";
import { canAdvanceWorkOrderStatus } from "@/lib/fleet-roles";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";
import { addWorkOrderPoLink } from "@/lib/work-order-po-links";
import { recordMutation } from "@/lib/record-mutation-log";
import { auditActorFrom } from "@/lib/mutation-audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const links = db.prepare(
    "SELECT * FROM work_order_po_links WHERE work_order_id = ? ORDER BY created_at DESC"
  ).all(id);
  return NextResponse.json(links);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();

  const integration = verifyFleetIntegrationKey(request);
  const user = integration ? null : await getVerifiedFleetUser(request);
  if (!integration && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!integration && user && !canAdvanceWorkOrderStatus(user.role, user.department)) {
    return NextResponse.json(
      {
        error:
          "Only users with a Fleet team department in People Resources (or superadmins) may add PR/PO links.",
      },
      { status: 403 }
    );
  }

  const historyActor = integration
    ? { id: "integration", name: "PR integration" }
    : { id: user!.id, name: user!.name || user!.email };

  const result = addWorkOrderPoLink(db, id, body, historyActor);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const woOrg = db.prepare("SELECT organization_id FROM work_orders WHERE id = ?").get(id) as
    | { organization_id: string }
    | undefined;

  recordMutation(db, {
    entityType: "work_order",
    entityId: id,
    organizationId: String(woOrg?.organization_id ?? ""),
    action: "update",
    actor: auditActorFrom(user, {
      id: historyActor.id,
      name: historyActor.name,
    }),
    after: {
      poLinkId: result.linkId,
      prNumber: body.prNumber || "",
      poNumber: body.poNumber || "",
      workOrderStatusAfter: result.workOrderStatusAfter,
    },
    reason: integration ? "integration" : "",
  });

  const entry = db.prepare("SELECT * FROM work_order_po_links WHERE id = ?").get(result.linkId) as
    | Record<string, unknown>
    | undefined;
  if (!entry) {
    return NextResponse.json({ error: "Link row missing after insert" }, { status: 500 });
  }
  return NextResponse.json(
    {
      ...entry,
      work_order_status_after: result.workOrderStatusAfter,
      advanced_from_needs_parts: result.advancedFromNeedsParts,
    },
    { status: 201 }
  );
}
