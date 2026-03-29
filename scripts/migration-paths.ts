/**
 * Shared paths for Phase 0 ingestion and validation.
 * Set FLEET_DATA_DIR to the folder containing Excel exports (parent of fleet-hub is typical).
 */
import path from "path";

/** Directory containing Fleet Maintenance Log, Cost tracker, Grounded vehicles Excel files */
export function getFleetDataDir(): string {
  if (process.env.FLEET_DATA_DIR) {
    return path.resolve(process.env.FLEET_DATA_DIR);
  }
  // Default: parent of fleet-hub when cwd is fleet-hub
  return path.resolve(process.cwd(), "..");
}

export interface ExpectedSourceFile {
  key: string;
  /** Glob-like basename pattern for documentation */
  pattern: string;
  resolvePath: (base: string) => string;
}

export const PHASE0_SOURCE_FILES: ExpectedSourceFile[] = [
  {
    key: "maintenance_log",
    pattern: "Fleet Maintenance Log book *.xlsm",
    resolvePath: (base) =>
      path.join(base, "Fleet Maintenance Log book 06022026.xlsm"),
  },
  {
    key: "cost_tracker",
    pattern: "Cost tracker for vehicles for *.xlsx",
    resolvePath: (base) =>
      path.join(base, "Cost tracker for vehicles for 06022026.xlsx"),
  },
  {
    key: "grounded",
    pattern: "GROUNDED VEHICLES*.xlsx",
    resolvePath: (base) =>
      path.join(base, "GROUNDED VEHICLES,PARTS AND PRICES.xlsx"),
  },
];

/** Optional WhatsApp export for trip/status parsing */
export function getDefaultWhatsAppPath(): string {
  if (process.env.FLEET_WHATSAPP_CHAT_PATH) {
    return path.resolve(process.env.FLEET_WHATSAPP_CHAT_PATH);
  }
  return path.join(
    getFleetDataDir(),
    "..",
    "Email Overlord",
    "chat transcripts",
    "WhatsApp Chat - 1PWR LS - Fleet and Logistics.txt"
  );
}

export function getDbPath(): string {
  if (process.env.DB_PATH) return path.resolve(process.env.DB_PATH);
  return path.join(process.cwd(), "fleet-hub.db");
}
