/**
 * Load imputed WhatsApp-derived ODO series for vehicle 36 into driver_vehicle_checks.
 * Idempotent: deletes prior rows whose remarks start with "imputed-whatsapp-36:" first.
 *
 * Usage (from fleet-hub/):
 *   npx tsx scripts/load-imputed-odo-36.ts --dry-run
 *   npx tsx scripts/load-imputed-odo-36.ts --apply
 *   DB_PATH=/var/lib/fleet-hub/fleet-hub.db npx tsx scripts/load-imputed-odo-36.ts --apply
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const apply = process.argv.includes("--apply");
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "fleet-hub.db");
const DATA = path.join(process.cwd(), "..", "vehicle-36-imputed-odo.json");

type Row = {
  km: number; date: string; caption: string; kind: string;
  route_from?: string; route_to?: string; leg_km?: number; confidence?: string;
};

function main() {
  const payload = JSON.parse(fs.readFileSync(DATA, "utf-8")) as {
    vehicle_id: string; organization_id: string; readings: Row[];
  };
  const db = new Database(DB_PATH);
  const vehicleId = payload.vehicle_id;
  const org = payload.organization_id;
  const tag = "imputed-whatsapp-36:";

  const existing = db.prepare(
    `SELECT COUNT(*) AS n FROM driver_vehicle_checks WHERE vehicle_id = ? AND remarks LIKE ?`
  ).get(vehicleId, tag + "%") as { n: number };
  console.log(`DB=${DB_PATH}`);
  console.log(`Existing imputed rows for 36: ${existing.n}`);
  console.log(`Will insert: ${payload.readings.filter(r => r.kind !== "checkpoint" || (r.leg_km ?? 0) > 0 || r.kind === "base").length}`);

  if (!apply) {
    console.log("[dry-run] no writes. Pass --apply to load.");
    db.close();
    return;
  }

  const del = db.prepare(`DELETE FROM driver_vehicle_checks WHERE vehicle_id = ? AND remarks LIKE ?`);
  const ins = db.prepare(`
    INSERT INTO driver_vehicle_checks (
      id, organization_id, vehicle_id, driver_id, driver_name,
      mileage_km, check_date, route_from, route_to, direction,
      overall_pass, remarks, created_at, updated_at
    ) VALUES (?, ?, ?, '', 'imputed', ?, ?, ?, ?, 'imputed', 1, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    del.run(vehicleId, tag + "%");
    for (const r of payload.readings) {
      if (r.kind === "checkpoint" && !(r.leg_km && r.leg_km > 0) && r.kind !== "base") continue;
      // always keep base
      const id = crypto.randomUUID().replace(/-/g, "");
      const remarks = `${tag}${r.kind} ${r.route_from || ""}→${r.route_to || ""} +${r.leg_km || 0}km [${r.confidence || ""}] | ${r.caption}`.slice(0, 500);
      const ts = (r as any).time || `${r.date}T12:00:00.000Z`;
      ins.run(id, org, vehicleId, r.km, r.date, r.route_from || "", r.route_to || "", remarks, ts, ts);
    }
    db.prepare(`UPDATE vehicles SET total_mileage_km = MAX(COALESCE(total_mileage_km,0), ?) WHERE id = ?`)
      .run(payload.readings[payload.readings.length - 1].km, vehicleId);
  });
  tx();
  const after = db.prepare(
    `SELECT COUNT(*) AS n, MAX(mileage_km) AS max_km FROM driver_vehicle_checks WHERE vehicle_id = ? AND remarks LIKE ?`
  ).get(vehicleId, tag + "%") as { n: number; max_km: number };
  console.log(`Loaded ${after.n} rows; max mileage_km=${after.max_km}`);
  db.close();
}

main();
