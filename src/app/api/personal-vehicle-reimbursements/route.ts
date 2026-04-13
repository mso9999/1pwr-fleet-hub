import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { countOperationalVehiclesInPool } from "@/lib/pvr-eligibility";
import {
  computeReimbursementLsl,
  getPvrRateSnapshotForOrg,
  validateJustificationForFullPerKm,
  type PvrFeeType,
  type PvrRateBand,
} from "@/lib/pvr-rates";

const ENTITY_TYPE = "pvr_claim";

function countAttachments(
  db: ReturnType<typeof getDb>,
  entityId: string,
  category: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM media_attachments WHERE entity_type = ? AND entity_id = ? AND category = ?`
    )
    .get(ENTITY_TYPE, entityId, category) as { c: number } | undefined;
  return row?.c ?? 0;
}

/**
 * GET /api/personal-vehicle-reimbursements?org=
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const org = request.nextUrl.searchParams.get("org") || "1pwr_lesotho";
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM personal_vehicle_reimbursement_requests WHERE organization_id = ? ORDER BY created_at DESC`
      )
      .all(org);
    return NextResponse.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/personal-vehicle-reimbursements GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/personal-vehicle-reimbursements
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const org = body.organizationId || "1pwr_lesotho";
    const id = (body.id as string) || uuidv4();
    const tripDate = String(body.tripDate || "").trim();
    const destination = String(body.destination || "").trim();
    const tripReason = String(body.tripReason || "").trim();
    const personalVehicleJustification = String(body.personalVehicleJustification || "").trim();
    const rateBand = body.rateBand as PvrRateBand;
    const feeType = body.feeType as PvrFeeType;
    const totalKm =
      body.totalKm != null && body.totalKm !== "" ? Number(body.totalKm) : null;
    const requestedById = String(body.requestedById || "");
    const requestedByName = String(body.requestedByName || "");
    const notes = String(body.notes || "").trim();

    if (!tripDate || !destination || !tripReason) {
      return NextResponse.json(
        { error: "tripDate, destination, and tripReason are required." },
        { status: 400 }
      );
    }

    if (rateBand !== "full" && rateBand !== "half") {
      return NextResponse.json({ error: "rateBand must be full or half." }, { status: 400 });
    }
    if (feeType !== "hq_round_trip" && feeType !== "per_km") {
      return NextResponse.json(
        { error: "feeType must be hq_round_trip or per_km." },
        { status: 400 }
      );
    }

    if (feeType === "per_km") {
      if (totalKm == null || !Number.isFinite(totalKm) || totalKm <= 20) {
        return NextResponse.json(
          { error: "Per-km claims require total km greater than 20 (see F006 policy)." },
          { status: 400 }
        );
      }
    }

    if (rateBand === "full" && feeType === "per_km") {
      const jErr = validateJustificationForFullPerKm(personalVehicleJustification);
      if (jErr) return NextResponse.json({ error: jErr }, { status: 400 });
    } else if (!personalVehicleJustification) {
      return NextResponse.json(
        { error: "Explain why a personal vehicle was used (short justification required)." },
        { status: 400 }
      );
    }

    const db = getDb();
    const existing = db.prepare("SELECT id FROM personal_vehicle_reimbursement_requests WHERE id = ?").get(id);
    if (existing) {
      return NextResponse.json({ error: "Claim id already exists — refresh and try again." }, { status: 409 });
    }

    const operationalCount = countOperationalVehiclesInPool(db, org);
    if (operationalCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot submit: ${operationalCount} fleet vehicle(s) are operational and available. Use a 1PWR vehicle or request allocation first.`,
          operationalVehicleCount: operationalCount,
        },
        { status: 403 }
      );
    }

    if (countAttachments(db, id, "insurance") < 1) {
      return NextResponse.json(
        { error: "Upload at least one proof-of-insurance document (category: insurance)." },
        { status: 400 }
      );
    }
    if (countAttachments(db, id, "mileage-evidence") < 1) {
      return NextResponse.json(
        {
          error:
            "Upload mileage evidence (odometer photos or map screenshot) with category mileage-evidence.",
        },
        { status: 400 }
      );
    }

    const rates = getPvrRateSnapshotForOrg(db, org);
    const reimbursementLsl = computeReimbursementLsl(rateBand, feeType, totalKm, rates);
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO personal_vehicle_reimbursement_requests (
        id, organization_id, trip_date, requested_by_id, requested_by_name,
        destination, trip_reason, personal_vehicle_justification,
        rate_band, fee_type, total_km, reimbursement_lsl, currency, rate_snapshot_json,
        pool_operational_count_snapshot, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)
    `
    ).run(
      id,
      org,
      tripDate,
      requestedById,
      requestedByName,
      destination,
      tripReason,
      personalVehicleJustification,
      rateBand,
      feeType,
      feeType === "per_km" ? totalKm : null,
      reimbursementLsl,
      "LSL",
      JSON.stringify(rates),
      operationalCount,
      notes,
      now,
      now
    );

    const row = db
      .prepare("SELECT * FROM personal_vehicle_reimbursement_requests WHERE id = ?")
      .get(id);
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/personal-vehicle-reimbursements POST]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
