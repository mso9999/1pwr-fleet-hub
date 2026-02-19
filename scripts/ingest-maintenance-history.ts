/**
 * Ingest historical maintenance records from:
 *   1. Fleet Maintenance Log book (xlsm) — per-vehicle sheets with maintenance entries
 *   2. Cost Tracker (xlsx) — per-vehicle sheets with cost/downtime entries
 *   3. Grounded Vehicles list (xlsx) — vehicles needing parts with prices
 *   4. WhatsApp daily updates — "TODAY'S UPDATES" messages with maintenance status
 *   5. Triage analysis — current Feb 2026 maintenance status
 *
 * Usage: npx tsx scripts/ingest-maintenance-history.ts [--dry-run]
 */

import * as XLSX from "xlsx";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const BASE_DIR = "/Users/mattmso/Dropbox/AI Projects/1PWR FLEET";
const DB_PATH = path.join(process.cwd(), "fleet-hub.db");
const isDryRun = process.argv.includes("--dry-run");

const MAINT_LOG_PATH = path.join(BASE_DIR, "Fleet Maintenance Log book 06022026.xlsm");
const COST_TRACKER_PATH = path.join(BASE_DIR, "Cost tracker for vehicles for 06022026.xlsx");
const GROUNDED_PATH = path.join(BASE_DIR, "GROUNDED VEHICLES,PARTS AND PRICES.xlsx");
const WHATSAPP_PATH = "/Users/mattmso/Dropbox/AI Projects/Email Overlord/chat transcripts/WhatsApp Chat - 1PWR LS - Fleet and Logistics.txt";

// Sheet name → fleet vehicle code mapping
const SHEET_TO_CODE: Record<string, string> = {
  "5L": "5L", "N2 (V6)": "V6", "P1": "P1", "X1": "X1", "S1": "S1", "S2": "S2",
  "TH": "TH", "36": "36", "R1": "R1", "R2": "R2", "J1": "J1", "J2": "J2",
  "J3": "J3", "M1": "M1", "N1": "N1", "DRig": "DRig", "Comp": "SMCOMP",
  "ATV": "ATV", "R3": "R3", "ST": "ST", "FClub": "X0", "X2": "X2", "JMC": "JMC",
  "X3": "X3", "KA24": "KA24", "ZD30": "ZD30", "X0": "X0",
};

// Cost tracker sheet name → fleet code
const COST_SHEET_TO_CODE: Record<string, string> = {
  "R1": "R1", "R2": "R2", "R3": "R3", "P1": "P1", "V6": "V6", "M1": "M1",
  "Raider": "RAIDER", "X1": "X1", "X2": "X2", "Surf 1": "S1", "Surf 2": "S2",
  "Offroad": "OFFROAD", "Jeep 1": "J1", "Jeep 2": "J2", "Jeep 3": "J3",
  "36": "36", "Telehandler": "TH", "Drill rig": "DRig", "T1": "T3",
  "T5": "T4", "T6": "T6", "T7": "T7", "JMC": "JMC",
};

// Grounded vehicles name → fleet code
const GROUNDED_TO_CODE: Record<string, string> = {
  "TH": "TH", "J2": "J2", "J3": "J3", "J1": "J1", "Pajero": "P1",
  "Off-road": "OFFROAD", "M1": "M1", "V6": "V6", "R1": "R1", "R2": "R2",
  "R1 & R2": "R1",
};

const SKIP_SHEETS = new Set([
  "Status", "Sheet1", "Sheet2", "Sheet3", "Sheet4", "Sheet5", "Sheet6",
  "log template", "Vehicle Schedule", "Material Handling Schedule", "WARNING",
]);

function excelDateToISO(serial: number): string {
  if (!serial || serial < 1000) return "";
  const date = new Date((serial - 25569) * 86400000);
  return date.toISOString().split("T")[0];
}

function parseExcelDate(val: unknown): string {
  if (!val) return "";
  if (typeof val === "number") return excelDateToISO(val);
  const s = String(val).trim();
  // Try to parse text dates like "Jan 5, 2026", "Feb 3, 26"
  const textMatch = s.match(/^([A-Za-z]+)\s+(\d+),?\s*(\d{2,4})/);
  if (textMatch) {
    const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const m = months[textMatch[1].toLowerCase().substring(0, 3)];
    let y = textMatch[3];
    if (y.length === 2) y = (parseInt(y) > 50 ? "19" : "20") + y;
    if (m) return `${y}-${m}-${textMatch[2].padStart(2, "0")}`;
  }
  return "";
}

function normalizeType(raw: string): "corrective" | "scheduled" | "inspection-flagged" {
  const lower = (raw || "").toLowerCase().trim();
  if (lower.includes("scheduled") || lower.includes("schedule")) return "scheduled";
  return "corrective";
}

function guessPriority(desc: string): "low" | "medium" | "high" | "critical" {
  const lower = desc.toLowerCase();
  if (lower.includes("engine") || lower.includes("overhaul") || lower.includes("crankshaft") || lower.includes("cylinder")) return "critical";
  if (lower.includes("brake") || lower.includes("steering") || lower.includes("clutch") || lower.includes("timing")) return "high";
  if (lower.includes("service") || lower.includes("oil") || lower.includes("filter")) return "low";
  return "medium";
}

interface MaintenanceEntry {
  vehicleCode: string;
  date: string;
  description: string;
  type: "corrective" | "scheduled" | "inspection-flagged";
  priority: "low" | "medium" | "high" | "critical";
  performedBy: string;
  validatedBy: string;
  remarks: string;
  status: string;
  source: string;
  costLSL: number;
  downtimeStart: string;
  downtimeEnd: string;
}

function parseMaintenanceLog(): MaintenanceEntry[] {
  console.log("--- Parsing Fleet Maintenance Log ---");
  if (!fs.existsSync(MAINT_LOG_PATH)) {
    console.log("  File not found:", MAINT_LOG_PATH);
    return [];
  }

  const wb = XLSX.readFile(MAINT_LOG_PATH);
  const entries: MaintenanceEntry[] = [];

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue;
    const code = SHEET_TO_CODE[sheetName];
    if (!code) {
      console.log(`  SKIP sheet: ${sheetName} (no code mapping)`);
      continue;
    }

    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

    // Detect header row (look for "Date" or "Maintenance" in row 7-9)
    let headerRow = 8;
    for (let i = 7; i <= 10; i++) {
      if (data[i] && String(data[i][0] || "").toLowerCase().includes("date")) {
        headerRow = i;
        break;
      }
    }

    // Detect column layout — some sheets swap cols 3 and 4
    const headerStr = (data[headerRow] || []).map((c) => String(c || "").toLowerCase());
    const typeColIdx = headerStr.findIndex((h) => h.includes("corrective") || h.includes("scheduled"));
    const performerColIdx = headerStr.findIndex((h) => h.includes("performed"));
    const validatorColIdx = headerStr.findIndex((h) => h.includes("validated"));
    const remarksColIdx = headerStr.findIndex((h) => h.includes("remarks") || h.includes("remark"));

    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0] || !row[1]) continue;
      const desc = String(row[1] || "").trim();
      if (!desc) continue;

      const dateStr = parseExcelDate(row[0]);
      if (!dateStr) continue;

      const typeVal = typeColIdx >= 0 ? String(row[typeColIdx] || "") : String(row[3] || "");
      const performer = performerColIdx >= 0 ? String(row[performerColIdx] || "") : String(row[4] || "");
      const validator = validatorColIdx >= 0 ? String(row[validatorColIdx] || "") : String(row[5] || "");
      const remarks = remarksColIdx >= 0 ? String(row[remarksColIdx] || "") : String(row[7] || "");

      // Determine status from remarks
      let status = "completed";
      const remarkLower = remarks.toLowerCase();
      if (remarkLower.includes("waiting") || remarkLower.includes("awaiting")) status = "awaiting-parts";
      else if (remarkLower.includes("um") || remarkLower === "um") status = "in-progress";
      else if (remarkLower.includes("to be") || remarkLower.includes("pending")) status = "diagnosed";

      entries.push({
        vehicleCode: code,
        date: dateStr,
        description: desc,
        type: normalizeType(typeVal),
        priority: guessPriority(desc),
        performedBy: performer.trim(),
        validatedBy: validator.trim(),
        remarks: remarks.trim(),
        status,
        source: "maintenance-log",
        costLSL: 0,
        downtimeStart: dateStr,
        downtimeEnd: status === "completed" ? dateStr : "",
      });
    }
  }

  console.log(`  Found ${entries.length} maintenance entries`);
  return entries;
}

function parseCostTracker(): MaintenanceEntry[] {
  console.log("\n--- Parsing Cost Tracker ---");
  if (!fs.existsSync(COST_TRACKER_PATH)) {
    console.log("  File not found:", COST_TRACKER_PATH);
    return [];
  }

  const wb = XLSX.readFile(COST_TRACKER_PATH);
  const entries: MaintenanceEntry[] = [];

  for (const sheetName of wb.SheetNames) {
    const code = COST_SHEET_TO_CODE[sheetName];
    if (!code) continue;

    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];

    // Row 1 is header, row 2+ is data
    for (let i = 2; i < data.length; i++) {
      const row = data[i];
      if (!row || (!row[0] && !row[1])) continue;

      const dateStr = parseExcelDate(row[0]);
      const desc = String(row[1] || "").trim();
      if (!desc) continue;

      const downtimeStart = parseExcelDate(row[2]);
      const downtimeEnd = parseExcelDate(row[3]);
      const repairDesc = String(row[5] || "").trim();
      const costVal = parseFloat(String(row[6] || "0").replace(/[^\d.]/g, "")) || 0;
      const otherDesc = String(row[7] || "").trim();
      const otherCost = parseFloat(String(row[8] || "0").replace(/[^\d.]/g, "")) || 0;

      const fullDesc = [desc, repairDesc, otherDesc].filter(Boolean).join(" — ");
      const totalCost = costVal + otherCost;

      entries.push({
        vehicleCode: code,
        date: dateStr || downtimeStart || "2026-01-01",
        description: fullDesc,
        type: "corrective",
        priority: guessPriority(fullDesc),
        performedBy: "",
        validatedBy: "",
        remarks: `Cost: R${totalCost.toFixed(0)}`,
        status: downtimeEnd ? "completed" : "in-progress",
        source: "cost-tracker",
        costLSL: totalCost,
        downtimeStart: downtimeStart || dateStr || "",
        downtimeEnd: downtimeEnd || "",
      });
    }
  }

  console.log(`  Found ${entries.length} cost entries`);
  return entries;
}

function parseGroundedVehicles(): MaintenanceEntry[] {
  console.log("\n--- Parsing Grounded Vehicles ---");
  if (!fs.existsSync(GROUNDED_PATH)) {
    console.log("  File not found:", GROUNDED_PATH);
    return [];
  }

  const wb = XLSX.readFile(GROUNDED_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
  const entries: MaintenanceEntry[] = [];

  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    const vehicleName = String(row[0] || "").trim();
    const part = String(row[1] || "").trim();
    const price = parseFloat(String(row[2] || "0").replace(/[^\d.]/g, "")) || 0;

    if (!vehicleName || !part) continue;
    const code = GROUNDED_TO_CODE[vehicleName];
    if (!code) {
      console.log(`  SKIP: ${vehicleName} (no code mapping)`);
      continue;
    }

    entries.push({
      vehicleCode: code,
      date: "2026-02-06",
      description: `Grounded — needs: ${part}`,
      type: "corrective",
      priority: "high",
      performedBy: "",
      validatedBy: "",
      remarks: price > 0 ? `Est. cost: R${price.toFixed(0)}` : "",
      status: "awaiting-parts",
      source: "grounded-list",
      costLSL: price,
      downtimeStart: "2026-02-06",
      downtimeEnd: "",
    });
  }

  console.log(`  Found ${entries.length} grounded vehicle entries`);
  return entries;
}

function parseWhatsAppUpdates(): MaintenanceEntry[] {
  console.log("\n--- Parsing WhatsApp Daily Updates ---");
  if (!fs.existsSync(WHATSAPP_PATH)) {
    console.log("  File not found:", WHATSAPP_PATH);
    return [];
  }

  const chatText = fs.readFileSync(WHATSAPP_PATH, "utf-8");
  const lines = chatText.split("\n");
  const entries: MaintenanceEntry[] = [];

  // Find "TODAY'S UPDATES" blocks
  let inUpdateBlock = false;
  let updateDate = "";
  let updateLines: string[] = [];

  for (const line of lines) {
    const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}\]/);

    if (line.includes("TODAY'S UPDATES") || line.includes("UPDATES FOR TODAY")) {
      inUpdateBlock = true;
      if (timestampMatch) updateDate = timestampMatch[1];
      updateLines = [];
      continue;
    }

    if (inUpdateBlock) {
      // End of update block when we hit a new timestamped message
      if (timestampMatch && !line.match(/^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]\s+(1PWR Fleet Office|See Pain)/)) {
        // Process collected update lines
        processUpdateBlock(updateDate, updateLines, entries);
        inUpdateBlock = false;
        updateLines = [];
      } else {
        // Strip timestamp prefix if present
        const content = line.replace(/^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]\s+[^:]+:\s*/, "").trim();
        if (content) updateLines.push(content);
      }
    }
  }

  // Process last block
  if (inUpdateBlock && updateLines.length > 0) {
    processUpdateBlock(updateDate, updateLines, entries);
  }

  console.log(`  Found ${entries.length} maintenance updates from WhatsApp`);
  return entries;
}

function processUpdateBlock(date: string, lines: string[], entries: MaintenanceEntry[]): void {
  // Vehicle code patterns in update lines
  const vehiclePattern = /\b(36|R1|R2|R3|S1|S2|V6|X0|X1|X2|X3|J1|J2|J3|JMC|KA24|ZD30|TH|P1|M1|N1)\b/i;

  for (const line of lines) {
    // Lines typically start with number: "1. 36, radiator collected..."
    const numMatch = line.match(/^\d+\.?\s*/);
    const content = numMatch ? line.substring(numMatch[0].length) : line;

    const vMatch = content.match(vehiclePattern);
    if (!vMatch) continue;

    const vehicleCode = vMatch[1].toUpperCase();
    const desc = content.replace(vehiclePattern, "").replace(/^[,\s]+/, "").trim();
    if (!desc || desc.length < 5) continue;

    // Determine status from text
    let status = "in-progress";
    const lower = desc.toLowerCase();
    if (lower.includes("waiting") || lower.includes("awaiting") || lower.includes("looking for")) status = "awaiting-parts";
    else if (lower.includes("done") || lower.includes("finished") || lower.includes("operational") || lower.includes("replaced")) status = "completed";
    else if (lower.includes("collected") || lower.includes("bought") || lower.includes("in progress")) status = "in-progress";

    entries.push({
      vehicleCode,
      date,
      description: desc.substring(0, 200),
      type: "corrective",
      priority: guessPriority(desc),
      performedBy: "",
      validatedBy: "",
      remarks: `From WhatsApp daily update ${date}`,
      status,
      source: "whatsapp-update",
      costLSL: 0,
      downtimeStart: date,
      downtimeEnd: status === "completed" ? date : "",
    });
  }
}

function parseTriageAnalysis(): MaintenanceEntry[] {
  console.log("\n--- Parsing Triage Analysis ---");
  // Hardcoded from fleet-triage-analysis.md — current Feb 2026 maintenance items
  const triageEntries: MaintenanceEntry[] = [
    { vehicleCode: "36", date: "2026-02-06", description: "Fan blade, radiator, rim weld, diesel lock history — radiator collected, fan blade sourcing from John Williams", type: "corrective", priority: "critical", performedBy: "Molefe", validatedBy: "", remarks: "HQ priority — heavy vehicle specialty", status: "in-progress", source: "triage-analysis", costLSL: 0, downtimeStart: "2026-02-01", downtimeEnd: "" },
    { vehicleCode: "R1", date: "2026-02-06", description: "Engine rebuild — crankshaft skimming, big end + main bearings replacement", type: "corrective", priority: "critical", performedBy: "Tebesi", validatedBy: "", remarks: "HQ priority — engine teardown", status: "in-progress", source: "triage-analysis", costLSL: 1770, downtimeStart: "2026-01-05", downtimeEnd: "" },
    { vehicleCode: "S1", date: "2026-02-06", description: "Timing belt snapped → water pump needs replacement", type: "corrective", priority: "high", performedBy: "Thene", validatedBy: "", remarks: "Timing belt done, water pump needed. Needed urgently for MAK site", status: "in-progress", source: "triage-analysis", costLSL: 0, downtimeStart: "2026-02-17", downtimeEnd: "" },
    { vehicleCode: "X3", date: "2026-02-06", description: "Clutch kit replacement + gear issues + electrical (brake lights stay on)", type: "corrective", priority: "high", performedBy: "Kola", validatedBy: "", remarks: "HQ priority — clutch plate in progress", status: "in-progress", source: "triage-analysis", costLSL: 0, downtimeStart: "2026-02-15", downtimeEnd: "" },
    { vehicleCode: "X2", date: "2026-02-06", description: "ECU failure — no engine management, sent to Germiston ECU Express", type: "corrective", priority: "medium", performedBy: "", validatedBy: "", remarks: "Recommend 3rd party auto electrician / ECU specialist", status: "awaiting-parts", source: "triage-analysis", costLSL: 0, downtimeStart: "2025-11-07", downtimeEnd: "" },
    { vehicleCode: "J3", date: "2026-02-06", description: "Throttle sensor failure — waiting for part from overseas", type: "corrective", priority: "medium", performedBy: "", validatedBy: "", remarks: "Recommend 3rd party auto electrician", status: "awaiting-parts", source: "triage-analysis", costLSL: 0, downtimeStart: "2025-01-01", downtimeEnd: "" },
    { vehicleCode: "KA24", date: "2026-02-06", description: "Service done, center bearing + universal joints remaining", type: "corrective", priority: "medium", performedBy: "", validatedBy: "", remarks: "Parts bought. Recommend 3rd party driveline shop", status: "in-progress", source: "triage-analysis", costLSL: 0, downtimeStart: "2026-02-01", downtimeEnd: "" },
    { vehicleCode: "ZD30", date: "2026-02-06", description: "Brake pads done, center bearing + universal joints remaining", type: "corrective", priority: "medium", performedBy: "", validatedBy: "", remarks: "Parts bought. Recommend 3rd party driveline shop", status: "in-progress", source: "triage-analysis", costLSL: 0, downtimeStart: "2026-02-01", downtimeEnd: "" },
    { vehicleCode: "JMC", date: "2026-02-06", description: "Front left CV joint (4x4), disc condition, CV joint bush cut", type: "corrective", priority: "medium", performedBy: "", validatedBy: "", remarks: "Being used for errands despite issues. Recommend 3rd party", status: "diagnosed", source: "triage-analysis", costLSL: 0, downtimeStart: "2026-02-01", downtimeEnd: "" },
    { vehicleCode: "V6", date: "2026-02-19", description: "Fuel pump failure — stuck in field at LEB + suspension issues", type: "corrective", priority: "high", performedBy: "", validatedBy: "", remarks: "Needs recovery from LEB first. Recommend fuel injection specialist", status: "reported", source: "triage-analysis", costLSL: 0, downtimeStart: "2026-02-19", downtimeEnd: "" },
  ];

  console.log(`  Found ${triageEntries.length} triage entries`);
  return triageEntries;
}

function main(): void {
  console.log("=== Ingest Historical Maintenance Records ===\n");
  console.log(`Mode: ${isDryRun ? "DRY RUN" : "LIVE INSERT"}\n`);

  // Parse all sources
  const maintEntries = parseMaintenanceLog();
  const costEntries = parseCostTracker();
  const groundedEntries = parseGroundedVehicles();
  const whatsappEntries = parseWhatsAppUpdates();
  const triageEntries = parseTriageAnalysis();

  const allEntries = [...maintEntries, ...costEntries, ...groundedEntries, ...whatsappEntries, ...triageEntries];
  console.log(`\nTotal entries to ingest: ${allEntries.length}`);
  console.log(`  Maintenance log: ${maintEntries.length}`);
  console.log(`  Cost tracker:    ${costEntries.length}`);
  console.log(`  Grounded list:   ${groundedEntries.length}`);
  console.log(`  WhatsApp updates: ${whatsappEntries.length}`);
  console.log(`  Triage analysis: ${triageEntries.length}`);

  if (isDryRun) {
    console.log("\nSample entries:");
    for (const e of allEntries.slice(0, 20)) {
      console.log(`  ${e.vehicleCode.padEnd(6)} ${e.date.padEnd(12)} ${e.description.substring(0, 50).padEnd(52)} ${e.status.padEnd(15)} ${e.source}`);
    }
    console.log("\n[DRY RUN] No data inserted.");
    return;
  }

  // Insert into SQLite
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Get vehicle ID map
  const vehicleRows = db.prepare("SELECT id, code FROM vehicles WHERE organization_id = '1pwr_lesotho'").all() as Array<{ id: string; code: string }>;
  const vehicleIdByCode = new Map(vehicleRows.map((v) => [v.code.toUpperCase(), v.id]));

  const insertWO = db.prepare(`
    INSERT INTO work_orders (id, organization_id, vehicle_id, title, description, type, priority, status, assigned_to, repair_location, third_party_shop, reported_by, remarks, downtime_start, downtime_end, created_at, updated_at)
    VALUES (lower(hex(randomblob(16))), '1pwr_lesotho', ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)
  `);

  const insertPart = db.prepare(`
    INSERT INTO parts (id, work_order_id, description, quantity, unit_cost, pr_status, supplier)
    VALUES (lower(hex(randomblob(16))), ?, ?, 1, ?, 'received', '')
  `);

  let inserted = 0;
  let skipped = 0;
  let partsInserted = 0;

  // Deduplicate: use vehicleCode + date + first 30 chars of description
  const seen = new Set<string>();

  const insertAll = db.transaction(() => {
    for (const e of allEntries) {
      const vehicleId = vehicleIdByCode.get(e.vehicleCode.toUpperCase());
      if (!vehicleId) {
        skipped++;
        continue;
      }

      // Dedup key
      const key = `${e.vehicleCode}|${e.date}|${e.description.substring(0, 30).toLowerCase()}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);

      const title = e.description.substring(0, 100);
      const fullDesc = e.description;
      const repairLoc = e.source === "triage-analysis" && e.remarks.includes("3rd party") ? "3rd-party" : "hq";
      const createdAt = e.date ? `${e.date}T08:00:00.000Z` : new Date().toISOString();
      const downtimeStart = e.downtimeStart ? `${e.downtimeStart}T00:00:00.000Z` : createdAt;
      const downtimeEnd = e.downtimeEnd ? `${e.downtimeEnd}T23:59:59.000Z` : null;

      try {
        const result = insertWO.run(
          vehicleId,
          title,
          `${fullDesc}\n\nSource: ${e.source}${e.remarks ? "\nRemarks: " + e.remarks : ""}`,
          e.type,
          e.priority,
          e.status,
          e.performedBy,
          repairLoc,
          e.validatedBy || e.performedBy || "",
          `[${e.source}] ${e.remarks}`.substring(0, 200),
          downtimeStart,
          downtimeEnd,
          createdAt,
          createdAt
        );

        if (result.changes > 0) {
          inserted++;

          // If there's a cost, insert a parts record
          if (e.costLSL > 0) {
            const woId = db.prepare("SELECT id FROM work_orders ORDER BY rowid DESC LIMIT 1").get() as { id: string };
            if (woId) {
              insertPart.run(woId.id, `Parts/repair for: ${title}`, e.costLSL);
              partsInserted++;
            }
          }
        }
      } catch (err) {
        skipped++;
      }
    }
  });

  insertAll();

  // Summary
  const totalWO = db.prepare("SELECT COUNT(*) as cnt FROM work_orders WHERE organization_id = '1pwr_lesotho'").get() as { cnt: number };
  const totalParts = db.prepare("SELECT COUNT(*) as cnt FROM parts").get() as { cnt: number };

  const woByStatus = db.prepare(`
    SELECT status, COUNT(*) as cnt FROM work_orders WHERE organization_id = '1pwr_lesotho' GROUP BY status ORDER BY cnt DESC
  `).all() as Array<{ status: string; cnt: number }>;

  const woBySource = db.prepare(`
    SELECT 
      CASE 
        WHEN remarks LIKE '%maintenance-log%' THEN 'maintenance-log'
        WHEN remarks LIKE '%cost-tracker%' THEN 'cost-tracker'
        WHEN remarks LIKE '%grounded%' THEN 'grounded-list'
        WHEN remarks LIKE '%whatsapp%' THEN 'whatsapp-update'
        WHEN remarks LIKE '%triage%' THEN 'triage-analysis'
        ELSE 'other'
      END as source,
      COUNT(*) as cnt
    FROM work_orders WHERE organization_id = '1pwr_lesotho' GROUP BY source ORDER BY cnt DESC
  `).all() as Array<{ source: string; cnt: number }>;

  console.log(`\n=== Ingestion Complete ===`);
  console.log(`  Work orders inserted: ${inserted}`);
  console.log(`  Parts records:        ${partsInserted}`);
  console.log(`  Skipped (no match/dup): ${skipped}`);
  console.log(`\n  Total work orders in DB: ${totalWO.cnt}`);
  console.log(`  Total parts in DB:       ${totalParts.cnt}`);
  console.log(`\nWork orders by status:`);
  for (const r of woByStatus) console.log(`  ${r.status.padEnd(18)} ${r.cnt}`);
  console.log(`\nWork orders by source:`);
  for (const r of woBySource) console.log(`  ${r.source.padEnd(20)} ${r.cnt}`);

  db.close();
}

main();
