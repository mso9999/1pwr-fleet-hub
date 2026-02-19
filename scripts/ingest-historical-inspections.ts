/**
 * Ingest historical inspection data from WhatsApp photos and known documents.
 * This script manually transcribes inspection findings from:
 *   - Nissan Inspections WhatsApp photos (Jan 2024)
 *   - OSF Vehicle Assessment Reports (PDFs)
 *
 * For future OCR of new images, see the ocr-inspection-image.ts script.
 *
 * Usage: npx tsx scripts/ingest-historical-inspections.ts
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "fleet-hub.db");

// Registration number → fleet vehicle code mapping
const REG_TO_CODE: Record<string, string> = {
  "A700BBV": "M1",    // Mitsubishi Pajero
  "A755BCM": "J1",    // Jeep Cherokee 1
  "A754BCM": "J3",    // Jeep No3
  "A374BBV": "R1",    // Ford Ranger 1
  "D753BBJ": "S1",    // Toyota Hilux (Surf1)
};

interface InspectionFinding {
  category: string;
  item: string;
  rating: "fail";
  note: string;
}

interface HistoricalInspection {
  vehicleCode: string;
  regNumber: string;
  vehicleDesc: string;
  inspectorName: string;
  inspectionDate: string;
  type: "detailed-mechanical";
  source: string;
  findings: InspectionFinding[];
}

// Transcribed from WhatsApp Image 2024-01-29 at 10.23.08.jpeg and 10.23.25.jpeg
// "1POWER GENERAL INSPECTION FOR 5 VEHICLES" — Nissan Report
const NISSAN_INSPECTION: HistoricalInspection[] = [
  {
    vehicleCode: "M1",
    regNumber: "A700BBV",
    vehicleDesc: "Mitsubishi Pajero",
    inspectorName: "Nissan Lesotho",
    inspectionDate: "2024-01-29",
    type: "detailed-mechanical",
    source: "nissan-inspection-photo",
    findings: [
      { category: "Brakes", item: "Brake pads", rating: "fail", note: "Needs replacement" },
      { category: "Brakes", item: "Brake discs (2)", rating: "fail", note: "Needs replacement" },
      { category: "Brakes", item: "Brake shoes", rating: "fail", note: "Needs replacement" },
      { category: "Drivetrain", item: "Right front inner CV boot kit", rating: "fail", note: "Needs replacement" },
      { category: "Wheels", item: "Wheel nuts (4)", rating: "fail", note: "Missing/damaged" },
    ],
  },
  {
    vehicleCode: "J1",
    regNumber: "A755BCM",
    vehicleDesc: "Jeep Cherokee",
    inspectorName: "Nissan Lesotho",
    inspectionDate: "2024-01-29",
    type: "detailed-mechanical",
    source: "nissan-inspection-photo",
    findings: [
      { category: "Brakes", item: "Brake shoes", rating: "fail", note: "Needs replacement" },
      { category: "Suspension", item: "Rear suspension arm", rating: "fail", note: "Needs replacement" },
      { category: "Drivetrain", item: "Left outer CV boot clamp", rating: "fail", note: "Needs replacement" },
      { category: "Wheels", item: "Front wheel stud", rating: "fail", note: "Damaged" },
      { category: "Wheels", item: "Wheel nuts (8)", rating: "fail", note: "Missing/damaged" },
      { category: "Electrical", item: "Stop light bulb", rating: "fail", note: "Not working" },
      { category: "Electrical", item: "Alternator", rating: "fail", note: "Needs attention" },
      { category: "Electrical", item: "Left tail lamp", rating: "fail", note: "Not working" },
    ],
  },
  {
    vehicleCode: "J3",
    regNumber: "A754BCM",
    vehicleDesc: "Jeep No3",
    inspectorName: "Nissan Lesotho",
    inspectionDate: "2024-01-29",
    type: "detailed-mechanical",
    source: "nissan-inspection-photo",
    findings: [
      { category: "Suspension", item: "Upper control arms (2)", rating: "fail", note: "Needs replacement" },
      { category: "Engine & Exhaust", item: "Fan belt", rating: "fail", note: "Worn" },
      { category: "Drivetrain", item: "Front prop shaft rubber boot", rating: "fail", note: "Torn" },
      { category: "Electrical", item: "Bulb", rating: "fail", note: "Not working" },
      { category: "Exterior", item: "Wiper blades (2)", rating: "fail", note: "Worn" },
      { category: "Engine & Exhaust", item: "Engine light", rating: "fail", note: "On — see dealer" },
    ],
  },
  {
    vehicleCode: "R1",
    regNumber: "A374BBV",
    vehicleDesc: "Ford Ranger",
    inspectorName: "Nissan Lesotho",
    inspectionDate: "2024-01-29",
    type: "detailed-mechanical",
    source: "nissan-inspection-photo",
    findings: [
      { category: "Steering", item: "Drag link", rating: "fail", note: "Worn" },
      { category: "Steering", item: "Idler arm", rating: "fail", note: "Worn" },
      { category: "Suspension", item: "Stabilizer bracket + 2 rubbers", rating: "fail", note: "Needs replacement" },
      { category: "Brakes", item: "Brake shoes", rating: "fail", note: "Worn" },
      { category: "Brakes", item: "Brake drums (2)", rating: "fail", note: "Worn" },
      { category: "Suspension", item: "Lower ball joints (2)", rating: "fail", note: "Needs replacement" },
      { category: "Drivetrain", item: "Gearbox mounting rubbers (2)", rating: "fail", note: "Worn" },
      { category: "Suspension", item: "Stopper bolts (2)", rating: "fail", note: "Needs replacement" },
      { category: "Suspension", item: "Stopper bolt caps (2)", rating: "fail", note: "Missing" },
      { category: "Drivetrain", item: "CV joint boot kits", rating: "fail", note: "Torn" },
    ],
  },
  {
    vehicleCode: "S1",
    regNumber: "D753BBJ",
    vehicleDesc: "Toyota Hilux",
    inspectorName: "Nissan Lesotho",
    inspectionDate: "2024-01-29",
    type: "detailed-mechanical",
    source: "nissan-inspection-photo",
    findings: [
      { category: "Brakes", item: "Brake pads", rating: "fail", note: "Worn" },
      { category: "Suspension", item: "Front shocks (2)", rating: "fail", note: "Needs replacement" },
      { category: "Suspension", item: "Rear shocks (2)", rating: "fail", note: "Needs replacement" },
      { category: "Electrical", item: "Battery terminals (2)", rating: "fail", note: "Corroded" },
      { category: "Engine & Exhaust", item: "Fan belts (4)", rating: "fail", note: "Worn/cracked" },
      { category: "Drivetrain", item: "Gear oil 500ml (3)", rating: "fail", note: "Low/needs top-up" },
      { category: "Brakes", item: "Brake shoes", rating: "fail", note: "Worn" },
      { category: "Wheels", item: "Wheel alignment", rating: "fail", note: "Needs alignment" },
    ],
  },
];

function main(): void {
  console.log("=== Ingest Historical Inspections ===\n");

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Get vehicle ID map
  const vehicleRows = db.prepare("SELECT id, code FROM vehicles WHERE organization_id = '1pwr_lesotho'").all() as Array<{ id: string; code: string }>;
  const vehicleIdByCode = new Map(vehicleRows.map((v) => [v.code.toUpperCase(), v.id]));

  console.log(`Vehicle codes in DB: ${Array.from(vehicleIdByCode.keys()).join(", ")}`);

  const insertInspection = db.prepare(`
    INSERT INTO inspections (id, organization_id, vehicle_id, inspector_id, inspector_name, type, items, overall_pass, created_at)
    VALUES (lower(hex(randomblob(16))), '1pwr_lesotho', ?, '', ?, ?, ?, 0, ?)
  `);

  let inserted = 0;
  let skipped = 0;

  for (const insp of NISSAN_INSPECTION) {
    const vehicleId = vehicleIdByCode.get(insp.vehicleCode.toUpperCase());
    if (!vehicleId) {
      console.log(`  SKIP: ${insp.vehicleCode} (${insp.vehicleDesc}) — no matching vehicle in DB`);
      skipped++;
      continue;
    }

    const items = insp.findings.map((f) => ({
      category: f.category,
      item: f.item,
      rating: f.rating,
      note: f.note,
    }));

    try {
      insertInspection.run(
        vehicleId,
        insp.inspectorName,
        insp.type,
        JSON.stringify(items),
        `${insp.inspectionDate}T00:00:00.000Z`
      );
      inserted++;
      console.log(`  INSERT: ${insp.vehicleCode} (${insp.vehicleDesc}) — ${items.length} findings`);
    } catch (err) {
      console.log(`  ERROR: ${insp.vehicleCode} — ${err instanceof Error ? err.message : "unknown"}`);
      skipped++;
    }
  }

  // Summary
  const totalInspections = db.prepare("SELECT COUNT(*) as cnt FROM inspections WHERE organization_id = '1pwr_lesotho'").get() as { cnt: number };

  console.log(`\n=== Ingestion Complete ===`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total inspections in DB: ${totalInspections.cnt}`);

  db.close();
}

main();
