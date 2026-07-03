/**
 * What's New folio — versioned with the code.
 *
 * RULE (see docs/WHATS_NEW_PRIMER.md):
 *   Any commit that introduces a NOVEL feature or RECONFIGURES an existing
 *   feature MUST add a new entry to this file in the same commit. The login
 *   popup will then automatically surface it to users who haven't seen it.
 *
 * Entry shape:
 *   - slug:          stable, unique, kebab-case. Never rename — it's the
 *                     per-user dismiss key (whats_new_seen.entry_slug).
 *   - title:         short headline.
 *   - summary:       one-line description for the popup list + archive index.
 *   - pages:         one or more { title, bodyMd } pages. Multi-page is fine
 *                     for bigger changes. bodyMd is rendered as markdown
 *                     (headings, lists, bold, links, code).
 *   - category:      "feature" | "reconfigure" | "fix"
 *   - audience:       "all" | "admin" | "fleet_lead" | "manager" | "driver"
 *                     (filters who sees the popup; archive shows all)
 *   - effectiveAt:    ISO 8601 date the entry became live (ship date).
 *   - appVersion:     optional package.json version at ship time.
 *   - commitSha:      optional short SHA of the shipping commit.
 *   - archived:       when true, the entry stays in the archive but no longer
 *                     pops at login (use for superseded/older items so new
 *                     users don't get a huge dump on first login).
 *
 * Ordering: newest first by effectiveAt. The popup surfaces un-seen,
 * non-archived entries matching the user's audience, newest first.
 */

export type WhatsNewCategory = "feature" | "reconfigure" | "fix";
export type WhatsNewAudience = "all" | "admin" | "fleet_lead" | "manager" | "driver";

export interface WhatsNewPage {
  title: string;
  bodyMd: string;
}

export interface WhatsNewEntry {
  slug: string;
  title: string;
  summary: string;
  pages: WhatsNewPage[];
  category: WhatsNewCategory;
  audience: WhatsNewAudience;
  effectiveAt: string;
  appVersion?: string;
  commitSha?: string;
  archived?: boolean;
}

export const WHATS_NEW_ENTRIES: WhatsNewEntry[] = [
  {
    slug: "mission-route-origin",
    title: "Missions now capture where the trip starts, not just where it's going",
    summary:
      "Every mission now records a route origin (departure point) so reviewers see the full From → To route on the approval view, not just the destination.",
    category: "reconfigure",
    audience: "all",
    effectiveAt: "2026-07-03",
    appVersion: "0.4.8",
    pages: [
      {
        title: "What changed",
        bodyMd:
          "Before, a mission profile only stored the **destination** — so on the *Missions pending management approval* view, a one-way field deployment to SEH showed `To SEH` with no indication of where the vehicle was actually departing from. That made route planning, fuel estimation, and driver assignment ambiguous for reviewers.\n\nNow every mission captures a **Route origin / departure point** (defaults to `HQ`), stored on the mission itself.",
      },
      {
        title: "What you'll see",
        bodyMd:
          "- **Mission creation form** has a new *Route origin / departure point* dropdown (defaults to HQ) shown for every trip shape.\n- **Mission approval view** header now reads `From HQ · To SEH · <date>`, and the detail panel has a dedicated **Origin** field plus a **Planned route** line that shows the full `HQ -> SEH` (or `HQ -> stop1 -> stop2` for multi-stop).\n- Existing missions created before this change default their origin to `HQ` so nothing breaks.\n- The origin carries through to trip checkout and the HR deployments API as the canonical departure point.",
      },
    ],
  },
  {
    slug: "trip-departure-tracker-crosscheck",
    title: "Start trip records the real departure time",
    summary:
      "A separate Start trip action now stamps the actual physical departure (not the checkout time) and flags tracker discrepancies when a vehicle leaves later than planned.",
    category: "feature",
    audience: "all",
    effectiveAt: "2026-06-29",
    appVersion: "0.4.8",
    pages: [
      {
        title: "Why this changed",
        bodyMd:
          "Before, the trip's **checkout time** was treated as the departure. In practice the team often inspects the evening before and leaves the next morning — so the recorded 'departure' was wrong, which made HR timecards and route reconciliation ambiguous.\n\nNow there are **two separate events**:\n- **Check out** — keys/ODO handed over (unchanged).\n- **Start trip / Depart now** — the vehicle physically leaves. This is the timestamp HR treats as the canonical field-deployment start.",
      },
      {
        title: "What you'll see",
        bodyMd:
          "- On the **Trips** page, active trips show *Checked out*, *Departed*, and *Planned* separately.\n- A **Start trip** button opens a small form to confirm departure (and optionally correct the ODO).\n- If your pre-departure checklist is older than 24 hours, the readiness gate blocks departure until you re-inspect or an approver overrides with a reason.\n- For vehicles with working trackers, the system cross-checks the planned departure date against the tracker's first movement and **flags a discrepancy** if the vehicle only moved the next day.",
      },
    ],
  },
  {
    slug: "passenger-manifest-from-hr",
    title: "Passenger manifest on the driver vehicle check",
    summary:
      "Passengers are now picked from the live HR directory (by employee ID) instead of free text — no more misspellings, and HR can link timecards to a specific deployment.",
    category: "feature",
    audience: "all",
    effectiveAt: "2026-06-29",
    appVersion: "0.4.8",
    pages: [
      {
        title: "What changed on the checklist",
        bodyMd:
          "When you fill a **departing** driver vehicle check, there's a new **Passenger manifest** section. Filter by country and department, then search by name/email/ID and add each person traveling on the vehicle.\n\nEach passenger is referenced by their **HR employee ID** — never typed free text — so:\n- names can't be misspelled or ambiguous,\n- HR can later link an employee's timecard to the exact field-deployment inspection.\n\nThe driver is still captured separately at the top of the form; the manifest is for the **additional personnel** riding the vehicle.",
      },
      {
        title: "Where the data comes from",
        bodyMd:
          "The picker queries the HR Portal (`hr.1pwrafrica.com`) employee directory server-side, filtered by country and department. The country/department filter options are pulled live from HR too, so they stay in sync as HR adds departments or countries.\n\nIf HR is temporarily unreachable, the picker shows a clear error — re-open it once HR is back.",
      },
    ],
  },
  {
    slug: "hr-deployments-api",
    title: "HR can now read field deployments from Fleet Hub",
    summary:
      "New read-only API lets the HR Portal gate timecards on the canonical field-deployment start date and link to the driver inspection checklist.",
    category: "feature",
    audience: "admin",
    effectiveAt: "2026-06-29",
    appVersion: "0.4.8",
    pages: [
      {
        title: "What HR can call",
        bodyMd:
          "Three read-only endpoints on `fm.1pwrafrica.com`, authenticated with an `X-API-Key` issued by Fleet:\n\n- `GET /api/deployments/current?employee_id=…` — the employee's **active** field deployment (or 404).\n- `GET /api/deployments?employee_id=…&from=&to=` — date-ranged history.\n- `GET /api/deployments/inspection/{id}` — a single, redacted inspection record (the deep link an HR approver opens from a timecard).\n\n`deployment_start_date` is the canonical start HR uses — it's the trip's actual departure time. Full contract: `API/DEPLOYMENTS_HR_API.md`.",
      },
    ],
  },
  {
    slug: "mission-trip-drafts",
    title: "Save missions and trips as drafts before submitting",
    summary:
      "Missions and trips can be saved and edited later before submission, visible only to the creator + admin + IT. Stale drafts are wiped after 30 days.",
    category: "feature",
    audience: "all",
    effectiveAt: "2026-05-30",
    appVersion: "0.4.8",
    archived: true,
    pages: [
      {
        title: "Drafts workflow",
        bodyMd:
          "- **Missions**: save as draft, edit later, then submit for approval.\n- **Trips**: save a private trip draft before checking out.\n- **Trip checkout** now shows a **Create mission now** shortcut when no eligible missions exist.\n- Drafts are private to the **creator + admin + IT** (fleet leads/managers don't see others' drafts by role alone).\n- Unsubmitted drafts older than **30 days** are purged automatically (daily cron).",
      },
    ],
  },
  {
    slug: "pr-centered-site-sync",
    title: "Realtime site sync with PR as the hub",
    summary:
      "Sites created/updated in UGP or PR now flow to AM and Fleet Hub in near-realtime. PR is the canonical source for sites including GPS.",
    category: "reconfigure",
    audience: "admin",
    effectiveAt: "2026-05-30",
    appVersion: "0.4.8",
    archived: true,
    pages: [
      {
        title: "How site data flows now",
        bodyMd:
          "- **UGP → PR**: UGP pushes site events to PR, which normalizes them (including GPS) into `referenceData_sites`.\n- **PR → AM / FM**: PR fans out canonical site payloads to both systems; FM ingests at `POST /api/sync/site-ingest` with GPS-preserving metadata merges.\n- **PR site form** now requires latitude/longitude (map picker).\n\nResult: route estimation in FM no longer fails for sites that UGP knows about but FM didn't have GPS for. See `API/SITE_SYNC_INGEST.md`.",
      },
    ],
  },
  {
    slug: "ugp-site-pull",
    title: "Fleet Hub pulls sites and GPS from UGP",
    summary:
      "Admins can pull country-aware site codes (with GPS) from UGP into Fleet Hub on demand, with a legacy-coordinate fallback for route estimation.",
    category: "feature",
    audience: "admin",
    effectiveAt: "2026-05-30",
    appVersion: "0.4.8",
    archived: true,
    pages: [
      {
        title: "Pulling sites from UGP",
        bodyMd:
          "`POST /api/sync/ugp-sites` (admin/fleet-mgmt only) fetches each configured country's site config from UGP and upserts into FM's `reference_data`, merging GPS into existing metadata without dropping other keys. Sites UGP doesn't carry GPS for fall back to known legacy coordinates so route estimation still works.\n\nSee `API/UGP_SITE_SYNC.md`.",
      },
    ],
  },
];
