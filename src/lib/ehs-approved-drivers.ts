/**
 * EHS approved operator register — compliance rules shared between API, UI, and tests.
 *
 * D018 model: a single driver record carries a status and five Pass / Fail / Pending
 * assessments, plus a per-category authorizations matrix (16 categories, each scored
 * none / approved / trainer with its own training-record evidence and notes).
 */

import type {
  AssessmentResult,
  OperatorCategoryCode,
  OperatorGrant,
} from "@/lib/ehs-operator-categories";
import { DEFAULT_OPERATOR_CATEGORY, getOperatorCategory } from "@/lib/ehs-operator-categories";

export type EhsDriverRow = {
  id: string;
  organization_id: string;
  hr_user_id: number | null;
  hr_employee_id: string;
  email: string;
  display_name: string;
  license_valid_from: string;
  license_expiry: string;
  license_originally_issued: string;
  // Legacy date fields: kept on the row for historical reference after the D018 migration.
  written_test_passed_at: string;
  road_test_passed_at: string;
  eye_test_passed_at: string;
  reaction_test_passed_at: string;
  // D018 tri-state assessments.
  vision_result: AssessmentResult;
  hearing_result: AssessmentResult;
  reaction_result: AssessmentResult;
  written_offroad_result: AssessmentResult;
  practical_result: AssessmentResult;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  updated_by_id: string;
  updated_by_name: string;
  attested_by_id: string;
  attested_by_name: string;
  attested_at: string | null;
};

export type EhsOperatorAuthorization = {
  id: string;
  operator_id: string;
  category_code: OperatorCategoryCode;
  grant: OperatorGrant;
  notes: string;
  created_at: string;
  updated_at: string;
};

function parseYmd(s: string): Date | null {
  const t = String(s || "").trim();
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** License must still be valid and have covered continuous validity for at least the prior two years.
 *  Uses license_originally_issued when available, falling back to license_valid_from. */
export function evaluateLicenseContinuity(
  licenseValidFrom: string,
  licenseExpiry: string,
  referenceNow: Date = new Date(),
  licenseOriginallyIssued?: string
): { ok: boolean; detail: string } {
  const vf = parseYmd(licenseValidFrom);
  const ex = parseYmd(licenseExpiry);
  if (!vf || !ex) {
    return {
      ok: false,
      detail: "Enter license valid-from and expiry (YYYY-MM-DD).",
    };
  }
  const refDay = startOfDay(referenceNow);
  const expDay = startOfDay(ex);
  if (expDay < refDay) {
    return { ok: false, detail: "License expiry date is in the past." };
  }
  const twoYearsAgo = new Date(refDay);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const originDate = parseYmd(licenseOriginallyIssued || "");
  const continuityDate = originDate ?? vf;
  const fromDay = startOfDay(continuityDate);
  if (fromDay > twoYearsAgo) {
    return {
      ok: false,
      detail:
        "License must show continuous validity for at least the past two years (originally-issued date is too recent).",
    };
  }
  return { ok: true, detail: "License dates satisfy the two-year continuity rule." };
}

export function hasAllTestDates(
  row: Pick<
    EhsDriverRow,
    "written_test_passed_at" | "road_test_passed_at" | "eye_test_passed_at" | "reaction_test_passed_at"
  >
): boolean {
  return (
    !!String(row.written_test_passed_at || "").trim() &&
    !!String(row.road_test_passed_at || "").trim() &&
    !!String(row.eye_test_passed_at || "").trim() &&
    !!String(row.reaction_test_passed_at || "").trim()
  );
}

export interface OperatorComplianceInput {
  row: EhsDriverRow;
  authorizations: EhsOperatorAuthorization[];
  /** Number of licence scans on file (entity_type = EHS_DRIVER_MEDIA_ENTITY). */
  licenceMediaCount: number;
  /** Per-authorization training-record media counts (keyed by authorization id). */
  trainingMediaCountByAuthId?: Record<string, number>;
  /** The category we're evaluating readiness for (default: fleet_vehicle_onroad). */
  category?: OperatorCategoryCode;
  referenceNow?: Date;
}

export interface OperatorComplianceResult {
  ready: boolean;
  reasons: string[];
  /** Current grant for the evaluated category (none | approved | trainer). */
  grant: OperatorGrant;
  /** True when the record has an attestation that matches the current updated_at. */
  attestationFresh: boolean;
}

/**
 * Decide whether an operator is cleared to be offered for a given category.
 *
 * Rules:
 * - Status = active, attested_at set.
 * - Vision, Hearing, Reaction assessments = pass (when the category requires physical assessment).
 * - Practical assessment = pass (when the category requires practical proficiency).
 * - Offroad written assessment = pass (when the category metadata says writtenRequired).
 * - Licence scan on file and (if required) covers the two-year continuity rule.
 * - Training record on file for the authorization row (when the category metadata says so).
 * - Grant for the category is 'approved' or 'trainer' (not 'none').
 */
export function evaluateOperatorCompliance(
  input: OperatorComplianceInput
): OperatorComplianceResult {
  const categoryCode = input.category ?? DEFAULT_OPERATOR_CATEGORY;
  const meta = getOperatorCategory(categoryCode);
  const reasons: string[] = [];
  const auth =
    input.authorizations.find((a) => a.category_code === categoryCode) ?? null;
  const grant: OperatorGrant = (auth?.grant as OperatorGrant | undefined) ?? "none";

  const result: OperatorComplianceResult = {
    ready: true,
    reasons,
    grant,
    attestationFresh: isAttestationFresh(input.row),
  };

  if (!meta) {
    reasons.push(`Unknown category '${categoryCode}'.`);
    result.ready = false;
    return result;
  }

  if ((input.row.status || "").toLowerCase() !== "active") {
    reasons.push("Operator status is not 'active'.");
    result.ready = false;
  }

  if (grant === "none") {
    reasons.push(`No authorization for '${meta.code}'.`);
    result.ready = false;
  }

  if (!result.attestationFresh) {
    reasons.push("Not attested by EHS (or record was edited after attestation).");
    result.ready = false;
  }

  if (meta.physicalAssessmentRequired) {
    if (input.row.vision_result !== "pass") {
      reasons.push("Vision assessment is not pass.");
      result.ready = false;
    }
    if (input.row.hearing_result !== "pass") {
      reasons.push("Hearing assessment is not pass.");
      result.ready = false;
    }
    if (input.row.reaction_result !== "pass") {
      reasons.push("Reaction assessment is not pass.");
      result.ready = false;
    }
  }

  if (meta.practicalRequired && input.row.practical_result !== "pass") {
    reasons.push("Practical proficiency is not pass.");
    result.ready = false;
  }

  if (meta.writtenRequired && input.row.written_offroad_result !== "pass") {
    reasons.push("Off-road written proficiency is not pass.");
    result.ready = false;
  }

  if (meta.licenceRequired) {
    if (input.licenceMediaCount < 1) {
      reasons.push("No licence scan on file.");
      result.ready = false;
    }
    if (meta.licenceTwoYearContinuity) {
      const lic = evaluateLicenseContinuity(
        input.row.license_valid_from,
        input.row.license_expiry,
        input.referenceNow,
        input.row.license_originally_issued
      );
      if (!lic.ok) {
        reasons.push(lic.detail);
        result.ready = false;
      }
    } else {
      // Even when 2-year continuity isn't required, the licence must still be valid (not expired).
      const ex = parseYmd(input.row.license_expiry);
      if (!ex) {
        reasons.push("Licence expiry date missing.");
        result.ready = false;
      } else if (startOfDay(ex) < startOfDay(input.referenceNow ?? new Date())) {
        reasons.push("Licence has expired.");
        result.ready = false;
      }
    }
  }

  if (meta.trainingRecordRequired) {
    const count = auth
      ? input.trainingMediaCountByAuthId?.[auth.id] ?? 0
      : 0;
    if (count < 1) {
      reasons.push("No training record on file for this authorization.");
      result.ready = false;
    }
  }

  return result;
}

/**
 * True when the record has an attestation timestamp that is still considered valid.
 *
 * We treat an attestation as "stale" when any edit occurred after it (updated_at > attested_at).
 * The API is also expected to clear attested_at on every PATCH / POST authorization, so this
 * check is belt-and-suspenders.
 */
export function isAttestationFresh(row: EhsDriverRow): boolean {
  const at = (row.attested_at || "").trim();
  if (!at) return false;
  const attested = new Date(at).getTime();
  const updated = new Date((row.updated_at || at).trim()).getTime();
  if (Number.isNaN(attested)) return false;
  if (Number.isNaN(updated)) return true;
  return attested >= updated;
}

/**
 * Backwards-compatible wrapper for the pre-D018 compliance helper. Keeps the older call
 * sites (e.g. places outside the page that still ask "is this driver fully compliant?")
 * functional by evaluating the default fleet-vehicle category.
 */
export function isEhsDriverFullyCompliant(
  row: EhsDriverRow,
  licenseMediaCount: number,
  referenceNow?: Date,
  authorizations: EhsOperatorAuthorization[] = []
): boolean {
  return evaluateOperatorCompliance({
    row,
    authorizations,
    licenceMediaCount: licenseMediaCount,
    category: DEFAULT_OPERATOR_CATEGORY,
    referenceNow,
  }).ready;
}

/**
 * Utility for tests and tooling: compute readiness across every D018 category at once.
 */
export function evaluateAllCategories(
  input: Omit<OperatorComplianceInput, "category">
): Record<OperatorCategoryCode, OperatorComplianceResult> {
  const categories = input.authorizations.map((a) => a.category_code as OperatorCategoryCode);
  const unique = Array.from(new Set<OperatorCategoryCode>([...categories, DEFAULT_OPERATOR_CATEGORY]));
  const out = {} as Record<OperatorCategoryCode, OperatorComplianceResult>;
  for (const code of unique) {
    out[code] = evaluateOperatorCompliance({ ...input, category: code });
  }
  return out;
}

