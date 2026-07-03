import type Database from "better-sqlite3";
import {
  WHATS_NEW_ENTRIES,
  type WhatsNewAudience,
  type WhatsNewEntry,
} from "@/content/whats-new/entries";

/**
 * Query layer for the What's New primer.
 *
 * Entries themselves are versioned in code (`src/content/whats-new/entries.ts`)
 * so a feature commit ships its own folio entry. The DB only tracks which
 * users have dismissed which entry slugs (the `whats_new_seen` table).
 */

function entryVisibleForAudience(entry: WhatsNewEntry, audience: WhatsNewAudience): boolean {
  return entry.audience === "all" || entry.audience === audience;
}

function roleToAudience(role: string): WhatsNewAudience {
  const r = String(role || "").toLowerCase();
  if (r === "admin" || r === "superadmin") return "admin";
  if (r === "fleet_lead") return "fleet_lead";
  if (r === "manager") return "manager";
  if (r === "driver") return "driver";
  return "all";
}

/** Slugs the user has already dismissed. */
function seenSlugsForUser(db: Database.Database, userId: string): Set<string> {
  const rows = db
    .prepare("SELECT entry_slug FROM whats_new_seen WHERE user_id = ?")
    .all(userId) as Array<{ entry_slug: string }>;
  return new Set(rows.map((r) => r.entry_slug));
}

/**
 * Entries the user hasn't dismissed, not archived, and matching their audience.
 * Newest first by effectiveAt.
 */
export function listUnseenForUser(
  db: Database.Database,
  user: { id: string; role: string }
): WhatsNewEntry[] {
  const seen = seenSlugsForUser(db, user.id);
  const audience = roleToAudience(user.role);
  return WHATS_NEW_ENTRIES.filter(
    (e) => !e.archived && !seen.has(e.slug) && entryVisibleForAudience(e, audience)
  ).sort((a, b) => (a.effectiveAt < b.effectiveAt ? 1 : -1));
}

/**
 * All entries (archive view), newest first. Audience filter optional — the
 * archive shows everything to any signed-in user so they can browse history.
 */
export function listAllEntries(includeArchived = true): WhatsNewEntry[] {
  return WHATS_NEW_ENTRIES.filter((e) => includeArchived || !e.archived).sort((a, b) =>
    a.effectiveAt < b.effectiveAt ? 1 : -1
  );
}

/**
 * Record dismissals idempotently. Only slugs that actually exist in the folio
 * are recorded, so stale client data can't pollute the table.
 */
export function markSeenForUser(
  db: Database.Database,
  userId: string,
  slugs: string[]
): { recorded: number } {
  const validSlugs = new Set(WHATS_NEW_ENTRIES.map((e) => e.slug));
  const toInsert = slugs.filter((s) => validSlugs.has(s));
  if (toInsert.length === 0) return { recorded: 0 };
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO whats_new_seen (user_id, entry_slug) VALUES (?, ?)`
  );
  const tx = db.transaction(() => {
    for (const slug of toInsert) stmt.run(userId, slug);
  });
  tx();
  return { recorded: toInsert.length };
}
