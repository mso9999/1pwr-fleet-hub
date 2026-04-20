#!/usr/bin/env tsx
/**
 * One-shot importer: move the D018 "Approved Operator List" Excel file into Fleet Hub.
 *
 * Usage:
 *   tsx scripts/migrate-d018-from-xlsx.ts \
 *     --file "/path/to/D018 ... .xlsx" \
 *     --org 1pwr_lesotho \
 *     [--dry-run]
 *
 * The script matches rows from the spreadsheet against Fleet Hub operators by
 * (1) HR employee ID if present on both sides, (2) otherwise by "First Last" name
 * (case-insensitive) against ehs_approved_drivers.display_name. Rows that cannot
 * be matched are reported so the EHS team can add them via the HR loader first.
 *
 * For each matched operator we:
 *   - Upsert the 16-category authorizations grid (✅ → approved, "Trainer" → trainer).
 *   - Set the five tri-state assessments from the "Driver's Assessments" sheet.
 *   - Clear the attestation (EHS must re-sign per D018 policy).
 *
 * The script is read-only unless called without --dry-run.
 */

import path from "node:path";
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import XLSX from "xlsx";

import {
  OPERATOR_CATEGORIES,
  isKnownOperatorCategory,
  type OperatorCategoryCode,
  type OperatorGrant,
  type AssessmentResult,
} from "../src/lib/ehs-operator-categories";

interface CliArgs {
  file: string;
  org: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    file: "",
    org: "1pwr_lesotho",
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i];
    else if (a === "--org") out.org = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: tsx scripts/migrate-d018-from-xlsx.ts --file <path.xlsx> [--org 1pwr_lesotho] [--dry-run]"
      );
      process.exit(0);
    }
  }
  if (!out.file) {
    console.error("--file is required");
    process.exit(1);
  }
  return out;
}

/**
 * Map each approved-operator-list column header (from row 6 of the sheet) to a D018
 * category code. Columns we don't understand are skipped with a warning.
 */
const APPROVED_COLUMN_TO_CATEGORY: Record<string, OperatorCategoryCode> = {
  "Insured 1PWR Vehicle on Public Roads": "fleet_vehicle_onroad",
  "Insured 1PWR Heavy Vehicle on Public Roads": "fleet_vehicle_onroad_heavy",
  "LDF Defensive driving certified": "ldf_defensive",
  "Motorcycle on public roads": "motorcycle_onroad",
  "Off road vehicle (ATV, motorcyle)": "offroad_vehicle",
  "Off road vehicle (ATV, motorcycle)": "offroad_vehicle",
  "Telehandler / Forklift / Tractor Loader Backhoe": "telehandler",
  Excavator: "excavator",
  "Drill Rig": "drill_rig",
  Tractor: "tractor",
  Crane: "crane",
  "CNC Milling": "cnc_milling",
  "Manual Milling / Turning": "manual_milling",
  "CNC Plasma Cutting": "cnc_plasma_cutting",
  "MiG Welder": "mig_welder",
  "TiG Welder": "tig_welder",
  "Machine Shop General": "machine_shop_general",
};

function normalizeGrant(cell: unknown): OperatorGrant | null {
  if (cell === undefined || cell === null) return null;
  const s = String(cell).trim().toLowerCase();
  if (!s) return null;
  if (s.includes("trainer")) return "trainer";
  // D018 uses ✅ and the occasional "x", "yes", etc. Anything non-empty counts as approved.
  return "approved";
}

function normalizeAssessment(cell: unknown): AssessmentResult | null {
  if (cell === undefined || cell === null) return null;
  const s = String(cell).trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("pass")) return "pass";
  if (s.startsWith("fail")) return "fail";
  if (s.startsWith("pending")) return "pending";
  return null;
}

interface ApprovedRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  notes: string;
  grants: Array<{ category: OperatorCategoryCode; grant: OperatorGrant }>;
}

interface AssessmentRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  vision: AssessmentResult | null;
  hearing: AssessmentResult | null;
  reaction: AssessmentResult | null;
  written: AssessmentResult | null;
  practical: AssessmentResult | null;
  notes: string;
}

function parseApprovedSheet(ws: XLSX.WorkSheet): ApprovedRow[] {
  const rows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(ws, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  // Headers live on row 6 (index 5). Employee rows start at index 6.
  const headers = (rows[5] ?? []).map((v) => String(v ?? "").trim());
  const colToCategory: Array<OperatorCategoryCode | null> = headers.map((h) => {
    const key = Object.keys(APPROVED_COLUMN_TO_CATEGORY).find(
      (name) => name.toLowerCase() === h.toLowerCase()
    );
    return key ? APPROVED_COLUMN_TO_CATEGORY[key] : null;
  });
  const notesCol = headers.findIndex((h) => h.toUpperCase() === "NOTES");
  const firstNameCol = headers.findIndex((h) => h.toLowerCase().includes("first name"));
  const lastNameCol = headers.findIndex((h) => h.toLowerCase().includes("last name"));
  const employeeIdCol = headers.findIndex((h) => h.toLowerCase().includes("employee id"));

  if (firstNameCol < 0 || lastNameCol < 0) {
    throw new Error("Could not locate First Name / Last Name columns in Approved Operator List.");
  }

  const out: ApprovedRow[] = [];
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const first = String(row[firstNameCol] ?? "").trim();
    const last = String(row[lastNameCol] ?? "").trim();
    if (!first && !last) continue;
    const employeeId = String(row[employeeIdCol] ?? "").trim();
    const notes = notesCol >= 0 ? String(row[notesCol] ?? "").trim() : "";

    const grants: ApprovedRow["grants"] = [];
    for (let c = 0; c < row.length; c++) {
      const cat = colToCategory[c];
      if (!cat) continue;
      const grant = normalizeGrant(row[c]);
      if (grant && grant !== "none") grants.push({ category: cat, grant });
    }

    out.push({ employeeId, firstName: first, lastName: last, notes, grants });
  }
  return out;
}

function parseAssessmentsSheet(ws: XLSX.WorkSheet): AssessmentRow[] {
  const rows = XLSX.utils.sheet_to_json<(string | number | undefined)[]>(ws, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  // Headers live on rows 4-5 in a two-row header block. Data starts at index 5.
  const out: AssessmentRow[] = [];
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const employeeId = String(row[0] ?? "").trim();
    const first = String(row[1] ?? "").trim();
    const last = String(row[2] ?? "").trim();
    if (!first && !last) continue;

    const vision = normalizeAssessment(row[3]);
    const hearing = normalizeAssessment(row[4]);
    const reaction = normalizeAssessment(row[5]);
    const written = normalizeAssessment(row[6]);
    const practical = normalizeAssessment(row[7]);
    const notes = String(row[8] ?? "").trim();

    out.push({
      employeeId,
      firstName: first,
      lastName: last,
      vision,
      hearing,
      reaction,
      written,
      practical,
      notes,
    });
  }
  return out;
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function resolveDbPath(): string {
  const env = process.env.DB_PATH;
  if (env && env.trim()) return env.trim();
  return path.join(process.cwd(), "fleet-hub.db");
}

type OperatorDbRow = {
  id: string;
  display_name: string;
  hr_employee_id: string;
  email: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const xlsxPath = path.resolve(args.file);
  console.log(`D018 import: ${xlsxPath}`);
  console.log(`Target org:  ${args.org}`);
  console.log(`Mode:        ${args.dryRun ? "DRY RUN (no writes)" : "APPLY"}`);

  const buffer = readFileSync(xlsxPath);
  const wb = XLSX.read(buffer, { type: "buffer" });

  const approvedSheet = wb.Sheets["Approved Operator List"];
  const assessmentsSheet = wb.Sheets["Driver's Assessments"];
  if (!approvedSheet || !assessmentsSheet) {
    throw new Error("Workbook is missing 'Approved Operator List' or 'Driver\u2019s Assessments' sheet");
  }

  const approved = parseApprovedSheet(approvedSheet);
  const assessments = parseAssessmentsSheet(assessmentsSheet);
  console.log(`Parsed ${approved.length} approved rows, ${assessments.length} assessment rows`);

  const db = new Database(resolveDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const operators = db
    .prepare(
      `SELECT id, display_name, hr_employee_id, email FROM ehs_approved_drivers WHERE organization_id = ?`
    )
    .all(args.org) as OperatorDbRow[];
  console.log(`Found ${operators.length} operators in ehs_approved_drivers for org ${args.org}`);

  const byEmpId = new Map<string, OperatorDbRow>();
  const byName = new Map<string, OperatorDbRow>();
  for (const o of operators) {
    if (o.hr_employee_id) byEmpId.set(normKey(o.hr_employee_id), o);
    if (o.display_name) byName.set(normKey(o.display_name), o);
  }

  function lookup(empId: string, first: string, last: string): OperatorDbRow | undefined {
    if (empId) {
      const hit = byEmpId.get(normKey(empId));
      if (hit) return hit;
    }
    const combined = normKey(`${first} ${last}`);
    if (combined) return byName.get(combined);
    return undefined;
  }

  const matches: Array<{ operator: OperatorDbRow; approved?: ApprovedRow; assessment?: AssessmentRow }> = [];
  const unmatched: string[] = [];

  for (const a of approved) {
    const op = lookup(a.employeeId, a.firstName, a.lastName);
    if (op) {
      matches.push({ operator: op, approved: a });
    } else {
      unmatched.push(`approved: ${a.employeeId || "(no id)"} ${a.firstName} ${a.lastName}`);
    }
  }
  for (const a of assessments) {
    const op = lookup(a.employeeId, a.firstName, a.lastName);
    if (op) {
      const m = matches.find((x) => x.operator.id === op.id);
      if (m) m.assessment = a;
      else matches.push({ operator: op, assessment: a });
    } else {
      unmatched.push(`assessment: ${a.employeeId || "(no id)"} ${a.firstName} ${a.lastName}`);
    }
  }

  console.log(`Matched ${matches.length} operators; ${unmatched.length} D018 rows could not be matched.`);
  if (unmatched.length > 0) {
    for (const u of unmatched) console.log(`  unmatched: ${u}`);
  }

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    for (const m of matches) {
      const opId = m.operator.id;

      if (m.assessment) {
        const a = m.assessment;
        const fields: string[] = ["attested_by_id = ''", "attested_by_name = ''", "attested_at = NULL", "updated_at = ?"];
        const values: unknown[] = [now];
        const setIf = (col: string, v: AssessmentResult | null): void => {
          if (v !== null) {
            fields.push(`${col} = ?`);
            values.push(v);
          }
        };
        setIf("vision_result", a.vision);
        setIf("hearing_result", a.hearing);
        setIf("reaction_result", a.reaction);
        setIf("written_offroad_result", a.written);
        setIf("practical_result", a.practical);
        if (a.notes) {
          fields.push("notes = ?");
          values.push(a.notes);
        }
        values.push(opId);
        db.prepare(`UPDATE ehs_approved_drivers SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      }

      if (m.approved) {
        if (m.approved.notes && !m.assessment?.notes) {
          db.prepare(
            `UPDATE ehs_approved_drivers SET notes = ?, attested_at = NULL, updated_at = ? WHERE id = ?`
          ).run(m.approved.notes, now, opId);
        }

        // Seed stubs for every category so the matrix renders.
        const existing = db
          .prepare(`SELECT category_code FROM ehs_operator_authorizations WHERE operator_id = ?`)
          .all(opId) as Array<{ category_code: string }>;
        const existingSet = new Set(existing.map((e) => e.category_code));
        const insertStub = db.prepare(
          `INSERT INTO ehs_operator_authorizations (id, operator_id, category_code, grant, notes, created_at, updated_at)
           VALUES (?, ?, ?, 'none', '', ?, ?)`
        );
        for (const meta of OPERATOR_CATEGORIES) {
          if (!existingSet.has(meta.code)) {
            insertStub.run(uuidv4(), opId, meta.code, now, now);
          }
        }

        for (const g of m.approved.grants) {
          if (!isKnownOperatorCategory(g.category)) continue;
          const already = db
            .prepare(
              `SELECT id FROM ehs_operator_authorizations WHERE operator_id = ? AND category_code = ?`
            )
            .get(opId, g.category) as { id: string } | undefined;
          if (already) {
            db.prepare(
              `UPDATE ehs_operator_authorizations SET grant = ?, updated_at = ? WHERE id = ?`
            ).run(g.grant, now, already.id);
          } else {
            db.prepare(
              `INSERT INTO ehs_operator_authorizations (id, operator_id, category_code, grant, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, '', ?, ?)`
            ).run(uuidv4(), opId, g.category, g.grant, now, now);
          }
        }
      }
    }
  });

  if (args.dryRun) {
    console.log("DRY RUN: summary of intended changes:");
    for (const m of matches) {
      const parts: string[] = [`- ${m.operator.display_name || m.operator.email}`];
      if (m.assessment) parts.push("assessments");
      if (m.approved?.grants?.length) parts.push(`${m.approved.grants.length} grants`);
      if (m.approved?.notes) parts.push("notes");
      console.log(parts.join(" · "));
    }
  } else {
    tx();
    console.log(`Applied ${matches.length} operator updates.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
