/**
 * EHS approved driver register — eligibility rules for fleet checkout (license continuity + tests).
 */

export type EhsDriverRow = {
  id: string;
  organization_id: string;
  hr_user_id: number | null;
  hr_employee_id: string;
  email: string;
  display_name: string;
  license_valid_from: string;
  license_expiry: string;
  written_test_passed_at: string;
  road_test_passed_at: string;
  eye_test_passed_at: string;
  reaction_test_passed_at: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  updated_by_id: string;
  updated_by_name: string;
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

/** License must still be valid and have covered continuous validity for at least the prior two years. */
export function evaluateLicenseContinuity(
  licenseValidFrom: string,
  licenseExpiry: string,
  referenceNow: Date = new Date()
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
  const fromDay = startOfDay(vf);
  if (fromDay > twoYearsAgo) {
    return {
      ok: false,
      detail:
        "License must show continuous validity for at least the past two years (valid-from is too recent).",
    };
  }
  return { ok: true, detail: "License dates satisfy the two-year continuity rule." };
}

export function hasAllTestDates(row: Pick<EhsDriverRow, "written_test_passed_at" | "road_test_passed_at" | "eye_test_passed_at" | "reaction_test_passed_at">): boolean {
  return (
    !!String(row.written_test_passed_at || "").trim() &&
    !!String(row.road_test_passed_at || "").trim() &&
    !!String(row.eye_test_passed_at || "").trim() &&
    !!String(row.reaction_test_passed_at || "").trim()
  );
}

export function isEhsDriverFullyCompliant(
  row: EhsDriverRow,
  licenseMediaCount: number,
  referenceNow?: Date
): boolean {
  if ((row.status || "").toLowerCase() !== "active") return false;
  if (licenseMediaCount < 1) return false;
  if (!hasAllTestDates(row)) return false;
  const lic = evaluateLicenseContinuity(row.license_valid_from, row.license_expiry, referenceNow);
  return lic.ok;
}
