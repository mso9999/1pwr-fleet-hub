/**
 * Parse WhatsApp chat messages to reconstruct historical trip data.
 * Patterns detected:
 *   "[timestamp] User: VehicleCode to/from Location"
 *   "[timestamp] User: VehicleCode out to Location"
 *   "[timestamp] User: VehicleCode @ Location"
 *   "[timestamp] User: VehicleCode Location"  (short status)
 *   "[timestamp] User: VehicleCode at Location"
 *   "[timestamp] User: Back at Location" or "Back" (checkin for last trip by user)
 *
 * Usage: npx tsx scripts/parse-whatsapp-trips.ts [--dry-run]
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const CHAT_PATH = "/Users/mattmso/Dropbox/AI Projects/Email Overlord/chat transcripts/WhatsApp Chat - 1PWR LS - Fleet and Logistics.txt";
const DB_PATH = path.join(process.cwd(), "fleet-hub.db");
const isDryRun = process.argv.includes("--dry-run");

// Known vehicle codes from fleet
const VEHICLE_CODES = new Set([
  "P1", "R1", "R2", "R3", "S1", "S2", "V6", "X0", "X1", "X2", "X3",
  "J1", "J3", "JMC", "KA24", "ZD30", "M1", "36",
  "5L", "N1", "T1", "Raider", "TH", "ATV",
]);

// Vehicle code aliases (informal names used in chat)
const VEHICLE_ALIASES: Record<string, string> = {
  "surf1": "S1",
  "surf 1": "S1",
  "surf2": "S2",
  "surf 2": "S2",
  "hardbody": "N1",
  "bakkie": "JMC",
  "nissan hardbody": "N1",
  "jeep": "J1",
};

// Known locations
const LOCATION_ALIASES: Record<string, string> = {
  "hq": "HQ",
  "office": "HQ",
  "maseru": "HQ",
  "mak": "MAK",
  "makhunoane": "MAK",
  "mas": "MAS",
  "masianokeng": "MAS",
  "seb": "SEB",
  "semonkong": "SEB",
  "sebapala": "SEB",
  "mat": "MAT",
  "matsieng": "MAT",
  "leb": "LEB",
  "lebelonyane": "LEB",
  "seh": "SEH",
  "sehlabathebe": "SEH",
  "qacha": "QN",
  "qacha's nek": "QN",
  "bfn": "BFN",
  "bloemfontein": "BFN",
  "town": "HQ",
  "spares": "HQ",
  "ladybrand": "Ladybrand",
  "leribe": "Leribe",
  "mafeteng": "Mafeteng",
  "matebeng": "Matebeng",
  "ha foso": "Ha Foso",
  "khohloaneng": "Khohloaneng",
  "morija": "Morija",
  "mount moorosi": "Mt Moorosi",
  "ha thetsane": "HQ",
  "hi q": "HQ",
  "midas": "HQ",
  "south line": "HQ",
  "taxi rank": "HQ",
  "panel beating": "HQ",
  "pioneer": "HQ",
};

function normalizeLocation(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return LOCATION_ALIASES[lower] || raw.trim();
}

interface ParsedMovement {
  timestamp: string;
  sender: string;
  vehicleCode: string;
  direction: "out" | "at" | "back";
  location: string;
  missionType: string;
  passengers: string;
  rawMessage: string;
}

function parseMessage(timestamp: string, sender: string, message: string): ParsedMovement | null {
  const msg = message.trim();
  const msgLower = msg.toLowerCase();

  // Skip media, empty, non-movement messages
  if (msg.startsWith("<media:") || msg.startsWith("*") || msg.length < 3) return null;
  if (msgLower.includes("update") || msgLower.includes("pr ") || msgLower.includes("@")) return null;

  // Try to find a vehicle code in the message
  let vehicleCode: string | null = null;
  let restOfMessage = msg;

  // Check explicit codes first (case-insensitive)
  for (const code of VEHICLE_CODES) {
    const regex = new RegExp(`\\b${code}\\b`, "i");
    if (regex.test(msg)) {
      vehicleCode = code;
      restOfMessage = msg.replace(regex, "").trim();
      break;
    }
  }

  // Check aliases
  if (!vehicleCode) {
    for (const [alias, code] of Object.entries(VEHICLE_ALIASES)) {
      if (msgLower.includes(alias)) {
        vehicleCode = code;
        restOfMessage = msg.replace(new RegExp(alias, "i"), "").trim();
        break;
      }
    }
  }

  if (!vehicleCode) return null;

  // Determine direction and location
  let direction: "out" | "at" | "back" = "at";
  let location = "";
  let missionType = "other";
  let passengers = "";

  // "Back" / "Back at Location"
  if (/\bback\b/i.test(restOfMessage)) {
    direction = "back";
    const backMatch = restOfMessage.match(/back\s+(?:at\s+)?(.+)/i);
    location = backMatch ? normalizeLocation(backMatch[1]) : "HQ";
  }
  // "out to Location" / "to Location"
  else if (/\b(?:out\s+)?to\b/i.test(restOfMessage)) {
    direction = "out";
    const toMatch = restOfMessage.match(/(?:out\s+)?to\s+(.+?)(?:\s*,\s*(.+))?$/i);
    if (toMatch) {
      location = normalizeLocation(toMatch[1].split(",")[0].split(" for ")[0]);
      const extra = toMatch[2] || toMatch[1];
      // Check for mission type
      if (/fleet\s*mission/i.test(extra)) missionType = "fleet-mission";
      else if (/1\s*meter|1meter/i.test(extra)) missionType = "1meter-mission";
      else if (/ehs/i.test(extra)) missionType = "ehs-mission";
      else if (/o\s*&?\s*m/i.test(extra)) missionType = "o&m-mission";
      else if (/registration/i.test(extra)) missionType = "registration";
      else if (/procurement|procure|spares|collect|deliver/i.test(extra)) missionType = "procurement";
      else if (/site\s*delivery/i.test(extra)) missionType = "site-delivery";
      // Check for passengers
      const passMatch = extra.match(/,\s*(.+)/);
      if (passMatch) passengers = passMatch[1].trim();
    }
  }
  // "from Location to Location"
  else if (/\bfrom\b/i.test(restOfMessage)) {
    direction = "out";
    const fromToMatch = restOfMessage.match(/from\s+(.+?)\s+to\s+(.+)/i);
    if (fromToMatch) {
      location = normalizeLocation(fromToMatch[2].split(",")[0].split(" for ")[0]);
    } else {
      const fromMatch = restOfMessage.match(/from\s+(.+?)(?:\s+to\s+)?(.+)?/i);
      if (fromMatch) {
        location = normalizeLocation(fromMatch[2] || fromMatch[1]);
      }
    }
  }
  // "@ Location" or "at Location"
  else if (/[@\bat\b]/i.test(restOfMessage)) {
    direction = "at";
    const atMatch = restOfMessage.match(/(?:@|at)\s*(.+)/i);
    if (atMatch) location = normalizeLocation(atMatch[1]);
  }
  // Short form: just a location after vehicle code
  else {
    const words = restOfMessage.replace(/[.,!?]/g, "").trim();
    if (words.length > 0 && words.length < 30) {
      location = normalizeLocation(words);
      direction = "at";
    }
  }

  if (!location) return null;

  return {
    timestamp,
    sender,
    vehicleCode,
    direction,
    location,
    missionType,
    passengers,
    rawMessage: msg,
  };
}

interface TripRecord {
  vehicleCode: string;
  driverName: string;
  departureLocation: string;
  destination: string;
  arrivalLocation: string;
  missionType: string;
  passengers: string;
  checkoutAt: string;
  checkinAt: string | null;
}

function main(): void {
  console.log(`=== Parse WhatsApp Fleet Chat → Trip History ===`);
  console.log(`Mode: ${isDryRun ? "DRY RUN" : "LIVE INSERT"}\n`);

  const chatText = fs.readFileSync(CHAT_PATH, "utf-8");
  const lines = chatText.split("\n");

  // Parse all messages
  const lineRegex = /^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]\s+([^:]+):\s+(.+)$/;
  const movements: ParsedMovement[] = [];

  for (const line of lines) {
    const match = line.match(lineRegex);
    if (!match) continue;
    const [, timestamp, sender, message] = match;
    const parsed = parseMessage(timestamp, sender.trim(), message);
    if (parsed) movements.push(parsed);
  }

  console.log(`Found ${movements.length} vehicle movements in ${lines.length} lines\n`);

  // Build trips by tracking vehicle state
  // An "out" movement starts a trip, "at"/"back" at a different location OR at HQ closes it
  const activeTrips = new Map<string, ParsedMovement>(); // vehicleCode -> last "out" movement
  const trips: TripRecord[] = [];

  for (const m of movements) {
    const current = activeTrips.get(m.vehicleCode);

    if (m.direction === "out") {
      // If there's an existing open trip for this vehicle, close it at unknown
      if (current) {
        trips.push({
          vehicleCode: current.vehicleCode,
          driverName: current.sender,
          departureLocation: current.location === m.location ? "HQ" : (current.location || "HQ"),
          destination: m.location,
          arrivalLocation: m.location,
          missionType: current.missionType,
          passengers: current.passengers,
          checkoutAt: current.timestamp,
          checkinAt: m.timestamp,
        });
      }
      activeTrips.set(m.vehicleCode, m);
    } else if (m.direction === "at" || m.direction === "back") {
      if (current) {
        trips.push({
          vehicleCode: current.vehicleCode,
          driverName: current.sender,
          departureLocation: "HQ",
          destination: current.location,
          arrivalLocation: m.location,
          missionType: current.missionType,
          passengers: current.passengers,
          checkoutAt: current.timestamp,
          checkinAt: m.timestamp,
        });
        activeTrips.delete(m.vehicleCode);
      } else {
        // Status update without prior "out" — treat as a confirmed location
        // Create a minimal trip: unknown → location
        if (m.location !== "HQ") {
          trips.push({
            vehicleCode: m.vehicleCode,
            driverName: m.sender,
            departureLocation: "HQ",
            destination: m.location,
            arrivalLocation: m.location,
            missionType: "other",
            passengers: "",
            checkoutAt: m.timestamp,
            checkinAt: m.timestamp,
          });
        }
      }
    }
  }

  console.log(`Reconstructed ${trips.length} trips\n`);

  // Print summary
  const byVehicle = new Map<string, number>();
  for (const t of trips) {
    byVehicle.set(t.vehicleCode, (byVehicle.get(t.vehicleCode) || 0) + 1);
  }
  console.log("Trips per vehicle:");
  for (const [code, count] of Array.from(byVehicle.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(8)} ${count}`);
  }

  if (isDryRun) {
    console.log("\nSample trips:");
    for (const t of trips.slice(0, 15)) {
      console.log(`  ${t.vehicleCode.padEnd(6)} ${t.departureLocation.padEnd(8)} → ${t.destination.padEnd(12)} by ${t.driverName.padEnd(20)} ${t.checkoutAt}`);
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

  const insertTrip = db.prepare(`
    INSERT OR IGNORE INTO trips (id, organization_id, vehicle_id, driver_id, driver_name, odo_start, departure_location, destination, arrival_location, mission_type, passengers, checkout_at, checkin_at, distance, source)
    VALUES (lower(hex(randomblob(16))), '1pwr_lesotho', ?, '', ?, 0, ?, ?, ?, ?, ?, ?, ?, NULL, 'whatsapp')
  `);

  let inserted = 0;
  let skipped = 0;

  const insertAll = db.transaction(() => {
    for (const t of trips) {
      const vehicleId = vehicleIdByCode.get(t.vehicleCode.toUpperCase());
      if (!vehicleId) {
        skipped++;
        continue;
      }
      try {
        insertTrip.run(
          vehicleId,
          t.driverName,
          t.departureLocation,
          t.destination,
          t.arrivalLocation,
          t.missionType,
          t.passengers,
          t.checkoutAt,
          t.checkinAt
        );
        inserted++;
      } catch {
        skipped++;
      }
    }
  });

  insertAll();

  console.log(`\n=== Insert Complete ===`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped:  ${skipped} (no matching vehicle ID)`);

  const totalTrips = db.prepare("SELECT COUNT(*) as cnt FROM trips WHERE organization_id = '1pwr_lesotho'").get() as { cnt: number };
  console.log(`  Total trips in DB: ${totalTrips.cnt}`);

  db.close();
}

main();
