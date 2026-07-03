# What's New login primer — system spec

**Status:** Live in production since 2026-07-03.
**Audience:** All Fleet Hub developers/agents. This is a binding process rule, not a suggestion.

---

## The rule

**Any commit that introduces a NOVEL feature or RECONFIGURES an existing feature MUST add a corresponding entry to [`src/content/whats-new/entries.ts`](../src/content/whats-new/entries.ts) in the same commit.**

That entry is what triggers the login "What's New" popup for every user who hasn't seen it. Skipping this step means users (and operators) silently miss the change, which defeats the purpose of the primer and creates avoidable "why did this change?" support traffic.

### What counts as "novel" or "reconfigured"

| Ships in the commit | Add an entry? |
|---|---|
| A new user-facing feature or screen | **Yes** |
| A reconfigured workflow (steps changed, defaults changed, gates added/removed) | **Yes** |
| A new API surface another system integrates against | **Yes** (audience `admin` if internal-only) |
| A behaviour change visible to drivers/operators (status labels, button moves, required fields) | **Yes** |
| A pure bug fix with no UX change | Optional — use category `fix` only if users would notice |
| A refactor, perf change, dependency bump, internal rename | **No** |
| A doc-only or CI-only change | **No** |

When in doubt, add the entry. The cost of a redundant entry is tiny; the cost of a silently-shipped reconfiguration is real.

---

## How the primer works

1. **Folio** — `src/content/whats-new/entries.ts` is a versioned array of entries. Each entry has a stable `slug`, `title`, `summary`, one or more `pages` (`{ title, bodyMd }`), `category`, `audience`, `effectiveAt`, and optional `archived` flag.
2. **Per-user dismiss tracking** — the `whats_new_seen` SQLite table records `(user_id, entry_slug)` pairs. The DB does NOT store entry content; content lives in code so it ships with the feature.
3. **Popup at login** — `WhatsNewDialog` (mounted in `AppShell`) fetches `GET /api/whats-new/unseen` after auth resolves. If non-empty, it opens a multi-page modal. Dismissing (close / Skip / "Got it" on the last page) POSTs the slugs to `/api/whats-new/dismiss`, so the popup won't reappear for those entries on future logins.
4. **No updates → no popup.** If the unseen list is empty, the dialog renders nothing. This is the "if no updates since last login no popup" requirement.
5. **Archive** — `/whats-new` is a permanent page listing every entry (archived + current), linked from the dialog ("View archive") and from the guide index. It is the companion to the tutorial/guide.

---

## Entry shape

```ts
interface WhatsNewEntry {
  slug: string;          // stable, unique, kebab-case. NEVER rename — it's the dismiss key.
  title: string;         // short headline
  summary: string;       // one-line description (popup list + archive index)
  pages: { title: string; bodyMd: string }[];  // 1+ pages; multi-page for bigger changes
  category: "feature" | "reconfigure" | "fix";
  audience: "all" | "admin" | "fleet_lead" | "manager" | "driver";
  effectiveAt: string;   // ISO 8601 date the entry became live (ship date)
  appVersion?: string;   // optional package.json version at ship time
  commitSha?: string;    // optional short SHA of the shipping commit
  archived?: boolean;    // true = stays in archive, no longer pops at login
}
```

### Markdown subset

`bodyMd` is rendered by a small dependency-free renderer (`src/components/WhatsNewDialog.tsx`) that supports: `##` / `###` headings, `**bold**`, `*italic*`, `` `code` ``, `[text](url)` links, `-` bullet lists, and `1.` numbered lists. Don't use tables, images, or HTML — they won't render.

### The `archived` flag

Mark an entry `archived: true` when it's old enough that even a brand-new user shouldn't get it popping on first login (e.g. a feature that's been the default for months, or a reconfiguration that's now just "how it works"). Archived entries stay visible in `/whats-new` — they're history, not deleted.

### The `audience` field

Filters who sees the popup. `all` = everyone. `admin` = admins/superadmins only (use for internal API contracts, ops changes). The archive page shows all entries to any signed-in user regardless of audience.

---

## Adding an entry — checklist (do this in the same commit as the feature)

1. Open `src/content/whats-new/entries.ts`.
2. Add a new entry object at the **top** of the `WHATS_NEW_ENTRIES` array (newest first by `effectiveAt`).
3. Pick a stable `slug` (kebab-case, descriptive, never reused). The slug is the per-user dismiss key — renaming it later will re-trigger the popup for everyone.
4. Write a one-line `summary` and a clear `title`.
5. Write 1+ `pages`. For a small change, one page is fine. For a workflow change with before/after, use two pages ("Why this changed" + "What you'll see").
6. Set `category` (`feature` / `reconfigure` / `fix`), `audience`, and `effectiveAt` (today's date).
7. Optional: set `appVersion` (from `package.json`) and `commitSha`.
8. Commit the entry in the same commit (or merge) as the feature code.
9. Deploy. On next login, every user who hasn't dismissed that slug sees the popup.

---

## API surface (internal)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/whats-new/unseen` | Current user's un-seen, non-archived entries (newest first). Empty array → no popup. |
| `POST` | `/api/whats-new/dismiss` | Body `{ slugs: string[] }` → marks them seen (idempotent). |
| `GET` | `/api/whats-new?includeArchived=true` | All entries (archive view). Default includes archived. |

All three require a Firebase bearer token (signed-in Fleet user). No API-key variant — this is an in-app surface, not a machine-to-machine contract.

---

## Implementation references

| Concern | File |
|---|---|
| Folio (versioned entries — **edit this when shipping a feature**) | `src/content/whats-new/entries.ts` |
| Query / dismiss layer | `src/lib/whats-new.ts` |
| Popup UI + mini markdown renderer | `src/components/WhatsNewDialog.tsx` |
| Archive page | `src/app/whats-new/page.tsx` |
| Schema (`whats_new_seen` table) | `src/lib/db.ts` (`ensureWhatsNewSeenTable`) |
| API routes | `src/app/api/whats-new/{route,unseen,dismiss}/route.ts` |
| Mount point | `src/components/AppShell.tsx` (`<WhatsNewDialog />`) |

---

## Operational notes

- **Slug stability.** Never rename a slug after it ships. If you need to "re-announce" a feature, add a new entry with a new slug (the old one stays dismissed for users who saw it).
- **No popup for brand-new users on archived entries.** Mark old entries `archived: true` so first-time users don't get a wall of historical popups. They can still browse the archive.
- **Popup is non-blocking.** The dialog is dismissable on every page; closing it never blocks the app. A failed `/api/whats-new/unseen` fetch is silent — the app works without the primer.
- **i18n.** The folio is currently English-only. If a non-English locale needs the primer, extend the entry shape with localized `title`/`summary`/`pages` and render by locale. Out of scope until requested.

---

## Why this exists

Operators and field staff were silently missing reconfigurations (new gates, moved buttons, new required fields) and then asking "why did this change?" in WhatsApp groups. The primer surfaces every meaningful change at the first login after it ships, and the archive gives a permanent record so anyone can look up "when did X change?" without paging through git log.
