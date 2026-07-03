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
    slug: "repairs-pipeline-and-pr-status",
    title: "Repairs pipeline board, live PR status, and parts you can actually edit",
    summary:
      "Work orders get a kanban Board view, PR/PO links show the live PR approval status with an Open-in-PR link, parts can be added/removed inline, and closing a work order now prompts for its closing inspection.",
    category: "feature",
    audience: "all",
    effectiveAt: "2026-07-03",
    appVersion: "0.4.8",
    pages: [
      {
        title: "What changed on the repairs side",
        bodyMd:
          "- **Board view** on the Work orders page — toggle List / Board to see repairs grouped by status (submitted → queued → in-progress → needs-parts → pr-submitted → awaiting-parts → completed → closed). Click any card to open the detail.\n- **Live PR status** on each PR/PO link — the Firestore-synced approval status and approved amount from the PR system now show next to each link, with an **Open in PR →** deep link.\n- **Parts add/remove** — a **+ Add part** form on the work order detail lets fleet add part lines (description, qty, unit cost, supplier, PR status, ETA) and remove them; `parts_cost` and `total_cost` recalculate automatically.\n- **Closing inspection** — transitioning a work order to **Closed** now prompts you to pick a recent inspection for the vehicle (the API already required it; the UI didn't)."
      },
      {
        title: "Where it shows up elsewhere",
        bodyMd:
          "- The **Dashboard** Open Work Orders card now includes a *Pipeline by status* row of clickable pills that filter the work orders page.\n- The **Triage** table now has a **Status** column so you can see where each open repair sits in the pipeline without opening it."
      }
    ]
  },
  {
    slug: "alternate-transport-trips",
    title: "Trips can now be lodged for public, third-party, and personal transport",
    summary:
      "Missions pick one of four transport modes. Non-company modes lodge a trip against a sentinel vehicle (no reserved vehicle needed) so HR/deployment tracking still works. Day-of mode switches need management approval.",
    category: "feature",
    audience: "all",
    effectiveAt: "2026-07-03",
    appVersion: "0.4.8",
    pages: [
      {
        title: "What changed",
        bodyMd:
          "Before, a mission was either *company vehicle* or *public transport* (a checkbox), and the trip checkout UI still required a reserved vehicle — so public-transport missions couldn't actually be checked out through the normal flow. Now there are **four explicit transport modes**:\n\n- **Company vehicle** (default)\n- **Public transport** (taxi / bus)\n- **Third-party / hired transport**\n- **Personal vehicle** (reimbursement is separate)\n\nNon-company missions lodge a trip against a per-org **sentinel vehicle** (`PUBLIC-TRANSPORT` / `THIRD-PARTY` / `PERSONAL-VEHICLE`) so the trip record exists for HR/deployment tracking, with no reserved vehicle required."
      },
      {
        title: "Day-of mode switch",
        bodyMd:
          "When an approved mission reaches departure day with no vehicle available (or the reserved vehicle is in repairs), the mission's expanded card has an **Alternate transport** panel:\n\n1. Pick a mode (public / third-party / personal) and write a reason (≥20 chars).\n2. Submit the request — it's recorded as `pending`.\n3. A management approver reviews it on the same panel and **Approve** or **Reject**.\n4. On approval, the mission's transport mode updates and the trip can be lodged.\n\nAt checkout, non-company missions skip ODO and vehicle fields and show a banner explaining the sentinel vehicle."
      }
    ]
  },
  {
    slug: "loadout-manifest-gate",
    title: "Missions moving assets now require an AM loadout manifest before checkout",
    summary:
      "Missions have a new 'Assets / equipment being moved' flag. When checked, trip checkout is blocked until at least one AM loadout manifest is linked to the mission.",
    category: "feature",
    audience: "all",
    effectiveAt: "2026-07-03",
    appVersion: "0.4.8",
    pages: [
      {
        title: "What changed",
        bodyMd:
          "Asset movement used to be inferred from free-text *Loadout / equipment* notes — nothing enforced that a packing list actually existed in Asset Management before the vehicle left. Now it's explicit:\n\n- The mission create form has an **Assets / equipment being moved** checkbox.\n- When checked, the mission's expanded card shows an **AM loadout manifest** linker — paste the manifest document id from [AM](https://am.1pwrafrica.com/loadout) to attach it.\n- Trip checkout's readiness panel adds a **Loadout manifest (assets moved)** gate that blocks until at least one manifest is linked."
      },
      {
        title: "How to use it",
        bodyMd:
          "1. When creating a mission that carries cargo/equipment, tick **Assets / equipment being moved**.\n2. Create the packing list in AM (`am.1pwrafrica.com/loadout`).\n3. Open the mission on the approval view and paste the manifest document id into the **AM loadout manifest** box → **Link**.\n4. Once linked, the checkout gate turns green and the trip can be checked out.\n\nMultiple manifests can be linked to one mission. The manifest content stays in AM; Fleet Hub only enforces the link exists."
      }
    ]
  },
  {
    slug: "mechanical-checklist-50km-gate",
    title: "Vehicles headed >50km now need a fleet mechanical checklist before allocation",
    summary:
      "When fleet allocates a vehicle to a destination beyond 50km from the vehicle's current location, a passing detailed mechanical inspection (≤14 days) is required — or a fleet-lead override with a written reason.",
    category: "reconfigure",
    audience: "all",
    effectiveAt: "2026-07-03",
    appVersion: "0.4.8",
    pages: [
      {
        title: "Why this changed",
        bodyMd:
          "Local trips (in and around HQ) don't need the same mechanical scrutiny as a field deployment to a distant site. Before, the mechanical-inspection gate was either always skipped or tied to a manual *Field* dropdown the requester chose themselves — neither reflected where the vehicle was actually driving.\n\nNow the gate is **distance-aware**: it triggers when the destination is more than **50 km** from the vehicle's *current location* (great-circle distance, with an HQ fallback when the vehicle's location GPS isn't set)."
      },
      {
        title: "What fleet leads see",
        bodyMd:
          "- On the **Fleet: reserve vehicles** card, each candidate shows **`mechanical inspection required`** or **`inspection on file`** in the dropdown when the destination is >50km away.\n- Selecting a vehicle that needs an inspection shows the distance and the requirement inline.\n- To reserve without an inspection, the fleet lead enters an **override reason (8+ chars)** — the same field already used for overlap / registration-disc overrides.\n- The gate also re-runs at trip checkout (so an inspection that aged out between reservation and checkout is caught), and a recent fleet-lead override carries forward so you don't have to override twice."
      }
    ]
  },
  {
    slug: "mission-pipeline-view",
    title: "See exactly where a mission is in its lifecycle",
    summary:
      "Every mission now shows a stepper (Draft → Submitted → Approved → Vehicle reserved → Checked out → Departed → Checked in) so you always know what's next and who acted.",
    category: "feature",
    audience: "all",
    effectiveAt: "2026-07-03",
    appVersion: "0.4.8",
    pages: [
      {
        title: "What changed",
        bodyMd:
          "The mission → trip flow used to be scattered across **Missions**, **Trips**, and **Vehicle checks** with no single view of where a mission stood. Now each mission card shows a **pipeline stepper** with all seven lifecycle stages, and the expanded detail includes a full **Lifecycle timeline** (created, approved, vehicle reserved, checked out, departed, checked in) with timestamps and actors.\n\nEach reached step is a deep link — click **Vehicle reserved** to jump to the trip checkout for that mission, **Departed** to open the active trip."
      },
      {
        title: "Better cross-page navigation",
        bodyMd:
          "When you follow a deep link from one workflow into another (e.g. *Create mission now* from the Trips page, or *Complete driver checklist* from the readiness panel), the destination now shows a **← Back to** link so you can return to where you came from instead of getting lost in the sidebar."
      }
    ]
  },
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
