import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyFleetIntegrationKey } from "@/lib/integration-auth";
import { applyWrittenOffroadPass } from "@/lib/ehs-written-offroad-sync";

/**
 * POST /api/integrations/v1/ehs-operators/written-offroad
 * EHS app write-back: mark D018 written_offroad_result = pass.
 * Auth: X-Fleet-Integration-Key. Does not clear EHS attestation.
 * Never creates an operator.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyFleetIntegrationKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    organizationId?: string;
    passed?: boolean;
    score?: number;
    attemptId?: string;
    passedAt?: string;
  } | null;

  if (!body?.email || !body.attemptId) {
    return NextResponse.json({ error: "email and attemptId are required" }, { status: 400 });
  }
  if (body.passed !== true) {
    return NextResponse.json(
      { error: "Only passing attempts update the D018 register" },
      { status: 400 }
    );
  }

  const result = applyWrittenOffroadPass(getDb(), {
    email: body.email,
    organizationId: body.organizationId || "1pwr_lesotho",
    attemptId: body.attemptId,
    passedAt: body.passedAt || new Date().toISOString(),
    score: typeof body.score === "number" ? body.score : 0,
  });

  if (!result.found) {
    return NextResponse.json({ found: false, error: "Operator not found" }, { status: 404 });
  }

  return NextResponse.json({
    found: true,
    alreadyPassed: result.alreadyPassed,
    operatorId: result.operatorId,
    writtenOffroadResult: result.writtenOffroadResult,
    writtenTestPassedAt: result.writtenTestPassedAt,
  });
}
