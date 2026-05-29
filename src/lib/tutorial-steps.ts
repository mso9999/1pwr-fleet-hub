/**
 * Interactive tutorials: each step highlights [data-tutorial] targets.
 * Multiple tracks: full app overview + focused workflow walkthroughs.
 */
import { TUTORIAL_STEP_TRANSLATIONS_FR } from "@/lib/tutorial-steps-fr";

export interface TutorialStep {
  id: string;
  path: string;
  target: string;
  title: string;
  body: string;
  /** Shown as a pill when the active persona / permission set changes (e.g. Management approver). */
  role?: string;
  suggestion?: string;
  seedOnEnter?: boolean;
}

export interface TutorialTrack {
  id: string;
  /** Shown in the tutorials menu */
  label: string;
  steps: TutorialStep[];
}

type TutorialLocale = "en" | "fr";
type TutorialStepLocaleFields = Pick<TutorialStep, "title" | "body" | "suggestion" | "role">;

/** Full app tour (original): dashboard → vehicles → trips → … */
const OVERVIEW_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    path: "/",
    target: "tutorial-dashboard-kpis",
    title: "Fleet dashboard",
    body:
      "This is your home view: uptime, repair metrics, open work orders, and active trips. Use the sidebar to reach every workflow.",
    suggestion: "Later you’ll try trips, checks, and work orders — all from real fleet data.",
  },
  {
    id: "status-grid",
    path: "/",
    target: "tutorial-dashboard-status",
    title: "Vehicle status counts",
    body:
      "These tiles summarise how many vehicles are operational, deployed, in maintenance, awaiting parts, or grounded. The alerts panel below also flags registration disc renewals (60 / 30 days and expired) when dates are on file.",
  },
  {
    id: "dashboard-panels",
    path: "/",
    target: "tutorial-dashboard-panels",
    title: "Trips & work orders at a glance",
    body:
      "Active trips and recent open work orders surface here, plus high-severity alerts (e.g. overdue trips, checkout holds, registration disc windows). Open the full pages from the sidebar for detail and actions.",
  },
  {
    id: "nav-vehicles",
    path: "/",
    target: "nav-vehicles",
    title: "Vehicles",
    body:
      "The Vehicles area is where you register assets, set category (4WD, cargo truck, plant, etc.), and open each vehicle’s dashboard.",
  },
  {
    id: "vehicles-list",
    path: "/vehicles",
    target: "tutorial-vehicles-header",
    title: "Vehicle register",
    body:
      "Browse the fleet table, filter by status, and add new vehicles. Each row links to maintenance history, trips, checks, and TCO.",
    seedOnEnter: true,
    suggestion:
      "Demo: we’ll add a temporary vehicle TUT-… for this walkthrough. It is deleted when you finish the tutorial.",
  },
  {
    id: "vehicles-add",
    path: "/vehicles",
    target: "tutorial-vehicles-add",
    title: "Add a vehicle (CRUD)",
    body:
      "Use Add Vehicle to capture code, make/model, category, and home location. Codes must be unique in your organisation.",
    suggestion: "Example: code TUT-R1, Ford Ranger, category 4WD, home HQ — or use the seeded TUT- demo row only.",
  },
  {
    id: "vehicles-open-detail",
    path: "/vehicles",
    target: "tutorial-vehicles-first-link",
    title: "Open a vehicle to manage it",
    body:
      "Click any vehicle code in the table to open its dashboard: status, history, tracker, and quick actions live here. The next step highlights the status switcher.",
    suggestion: "Tap a vehicle code (any row) before pressing Next so the highlight lands on the detail page.",
  },
  {
    id: "vehicles-status-change",
    path: "/vehicles",
    target: "tutorial-vehicle-status-change",
    title: "Set operational / under-maintenance status",
    body:
      "Quick Status Change drives the lifecycle. operational and deployed are automatic. diagnosis is the pre-WO investigation state. maintenance-hq, maintenance-3rdparty, awaiting-parts, and grounded require at least one open work order (submitted through in-progress, needs-parts, PR submitted, or awaiting-parts) — the system blocks the change otherwise and offers to open a WO or set diagnosis instead. written-off needs management sign-off (admin / fleet management / executive / finance / superadmin) plus a written reason.",
    suggestion: "Closing a work order does NOT automatically return the vehicle to operational; fleet positively confirms the next state once the work is done.",
  },
  {
    id: "nav-trips",
    path: "/vehicles",
    target: "nav-trips",
    title: "Trips (operational check-out)",
    body:
      "Trips record the real vehicle on the road: driver, route, loadout, and return. Check-in captures odometer and issues. Planned missions and requesting a vehicle by type (not a specific unit) live under Vehicle requests.",
  },
  {
    id: "trips-checkout",
    path: "/trips",
    target: "tutorial-trips-checkout",
    title: "Check out / check in",
    body:
      "Open Check Out Vehicle for a new trip; use Check In when the vehicle returns. Completed trips feed history and mileage.",
    suggestion: "Example: HQ → MAS, mission site delivery, odometer from the vehicle check.",
  },
  {
    id: "trips-loadout",
    path: "/trips",
    target: "tutorial-trips-loadout-manifests",
    title: "Load-out manifests (Asset Management)",
    body:
      "Packing lists are created in Asset Management (am.1pwrafrica.com). Link a manifest to this trip by pasting its document ID from AM, or open a linked manifest in AM for the full list. Managers can unlink when the association changes.",
    suggestion:
      "Scroll to Load-out manifests (AM) on an active trip or expand a completed trip in Trip History. Link/unlink requires Manager-level access.",
  },
  {
    id: "nav-checks",
    path: "/trips",
    target: "nav-vehicle-checks",
    title: "Pre-deployment checks",
    body:
      "Driver vehicle checks are the gate before deployment. Failures can require manager approval before the vehicle leaves.",
  },
  {
    id: "vehicle-checks-new",
    path: "/vehicle-checks",
    target: "tutorial-vehicle-checks-new",
    title: "New vehicle check",
    body:
      "Complete electrics, fluids, driveability, and equipment lists. Submitting creates an auditable record linked to the vehicle.",
  },
  {
    id: "nav-work-orders",
    path: "/vehicle-checks",
    target: "nav-work-orders",
    title: "Work orders & job cards",
    body:
      "Work orders track repairs: status, assignee, labour, parts, and PR/PO links. Statuses include needs-parts and PR submitted for the procurement pipeline.",
  },
  {
    id: "work-orders-list",
    path: "/work-orders",
    target: "tutorial-work-orders-header",
    title: "Maintenance pipeline",
    body:
      "Create jobs from field reports or inspections, move them through triage, and close with costs and downtime.",
  },
  {
    id: "nav-maintenance",
    path: "/work-orders",
    target: "nav-maintenance",
    title: "Scheduled maintenance",
    body:
      "Plan interval-based service by km and date. Overdue items can raise alerts and optional auto work orders.",
  },
  {
    id: "nav-requests",
    path: "/work-orders",
    target: "nav-vehicle-requests",
    title: "Vehicle requests",
    body:
      "Create an approved mission first, then request a vehicle type (asset class). Managers approve the request line; a fleet team lead assigns a pool vehicle. Site destinations get a mapped distance hint; fuel estimates appear after assignment.",
  },
  {
    id: "nav-inspections",
    path: "/vehicle-requests",
    target: "nav-inspections",
    title: "Inspections",
    body:
      "Structured checklists: quick pre-departure, detailed mechanical, cross-border transfer prep, or the full 2025 template. Inspections support compliance and can raise work orders when items fail.",
  },
  {
    id: "inspections-peek",
    path: "/inspections",
    target: "tutorial-inspections-new",
    title: "Inspection checklists",
    body:
      "Create inspections from the button below; past checklists appear in the list. For international moves, use Detailed mechanical or Mechanical (cross-border transfer) with an overall pass.",
  },
  {
    id: "nav-country-transfers",
    path: "/inspections",
    target: "nav-vehicle-country-changes",
    title: "Country transfers",
    body:
      "Use this area to approve queue items. To submit a change, open any vehicle and use Country / organization → Request change (corrections vs real transfers).",
  },
  {
    id: "country-transfers-peek",
    path: "/vehicle-country-changes",
    target: "tutorial-country-transfers-page",
    title: "Transfer approvals",
    body:
      "Fleet leads approve data-entry corrections; executives approve secondments and permanent moves that include mission and mechanical inspection evidence.",
  },
  {
    id: "nav-map",
    path: "/vehicle-country-changes",
    target: "nav-map",
    title: "Fleet map",
    body:
      "Live or last-known GPS positions (where trackers are fitted). From a marker you can open the vehicle or active trip. The map frames the country selected in the header.",
  },
  {
    id: "nav-tco",
    path: "/map",
    target: "nav-tco",
    title: "TCO & analytics",
    body:
      "Total cost of ownership, end-of-life scoring, and cohort performance — fed by work orders, mileage, and purchase data.",
  },
  {
    id: "nav-reports",
    path: "/tco",
    target: "nav-reports",
    title: "Reports & exports",
    body:
      "Download CSV exports for vehicles, trips, checks, maintenance, TCO, and more for spreadsheets or audits.",
  },
  {
    id: "nav-daily",
    path: "/reports",
    target: "nav-daily-update",
    title: "Daily update (WhatsApp)",
    body:
      "Generate a text summary from the day’s work order notes and status changes — copy, edit, then post to WhatsApp.",
  },
  {
    id: "finish",
    path: "/daily-update",
    target: "tutorial-daily-update-editor",
    title: "You’re done",
    body:
      "That covers the main workflows. Finish below to remove any tutorial demo records (vehicles whose code starts with TUT-) from the database.",
    suggestion: "Click Finish tutorial to clean up demo data and close this walkthrough.",
  },
];

/** Step-by-step: perform a driver vehicle check */
const DRIVER_CHECK_STEPS: TutorialStep[] = [
  {
    id: "dvc-intro",
    path: "/vehicle-checks",
    target: "nav-vehicle-checks",
    title: "Driver vehicle check workflow",
    body:
      "This short tour walks through the pre-deployment checklist. You’ll open a new check, fill direction and vehicle, rate each line, confirm equipment, then submit.",
    suggestion: "You must be on Vehicle Checks. Use the sidebar if you’re elsewhere.",
  },
  {
    id: "dvc-new",
    path: "/vehicle-checks",
    target: "tutorial-vehicle-checks-new",
    title: "1. Start a new check",
    body:
      "Tap + New vehicle check to expand the form. If you don’t see the highlighted button, scroll to the top of this page.",
    suggestion: "After the form opens, tap Next to continue.",
  },
  {
    id: "dvc-form",
    path: "/vehicle-checks",
    target: "tutorial-dvc-form",
    title: "2. The checklist form",
    body:
      "Everything below is one submission: direction, vehicle and driver, odometer with photo, four exterior photos, route, pass/fail lines, equipment, remarks, then Submit.",
  },
  {
    id: "dvc-direction",
    path: "/vehicle-checks",
    target: "tutorial-dvc-direction",
    title: "3. Direction",
    body:
      "Choose whether the vehicle is leaving HQ or returning. This sets context for the deployment.",
  },
  {
    id: "dvc-photos",
    path: "/vehicle-checks",
    target: "tutorial-dvc-photos",
    title: "4. Odometer and exterior photos",
    body:
      "Enter the odometer reading (km), photograph the gauge, then add front, rear, left, and right exterior photos. These document mileage and vehicle condition at the time of the check.",
  },
  {
    id: "dvc-lines",
    path: "/vehicle-checks",
    target: "tutorial-dvc-status-grid",
    title: "5. Rate each status line",
    body:
      "Tap ✓ for pass or ✗ for fail on electrics, fluids, driveability, and visual items. If you fail a line, describe it in the text box that appears.",
  },
  {
    id: "dvc-equip",
    path: "/vehicle-checks",
    target: "tutorial-dvc-equipment",
    title: "6. Equipment (Yes / No)",
    body:
      "Confirm jack, spare, triangle, tools, and other required items. Missing kit may be logged for follow-up.",
  },
  {
    id: "dvc-submit",
    path: "/vehicle-checks",
    target: "tutorial-dvc-submit",
    title: "7. Submit",
    body:
      "When complete, tap Submit vehicle check. Failures may require manager approval before deployment—your org’s policy applies.",
  },
];

/** Mechanical / structured inspection checklist */
const VEHICLE_INSPECTION_STEPS: TutorialStep[] = [
  {
    id: "insp-intro",
    path: "/inspections",
    target: "nav-inspections",
    title: "Mechanical inspection workflow",
    body:
      "Inspections are structured checklists: pre-departure, detailed mechanical, mechanical (cross-border transfer), or the full 2025 template. You’ll open a new inspection, pick a type, rate each line, then submit.",
  },
  {
    id: "insp-new",
    path: "/inspections",
    target: "tutorial-inspections-new",
    title: "1. New inspection",
    body:
      "Tap + New inspection to open the form. The list below shows saved inspections once you’ve submitted.",
    suggestion: "Open the form, then tap Next.",
  },
  {
    id: "insp-tabs",
    path: "/inspections",
    target: "tutorial-inspections-tabs",
    title: "2. Choose checklist type",
    body:
      "Choose a checklist type: Pre-departure (quick), Detailed mechanical, Mechanical (cross-border transfer) for international moves, or 1PWR checklist (2025) full. The driver-proficiency option opens a separate full form. Switching tab clears your draft.",
  },
  {
    id: "insp-form",
    path: "/inspections",
    target: "tutorial-inspections-form",
    title: "3. Vehicle, inspector, and lines",
    body:
      "Select vehicle and inspector name. For each row choose Pass, Warn (caution), or Fail. Fail usually requires a note, photo, or body-plan mark before submit.",
    suggestion: "Any Fail on a new submission can create a high-priority work order for that vehicle.",
  },
  {
    id: "insp-submit",
    path: "/inspections",
    target: "tutorial-inspections-submit",
    title: "4. Submit inspection",
    body:
      "When finished, submit. Overall pass requires no Fail lines. Export history later under Reports if needed.",
  },
];

/**
 * End-to-end field deployment: mission → management approval → fleet reservation →
 * optional calendar → driver checklist (field) → mission-linked trip checkout → load-out.
 * `role` on each step signals when a different person or permission set typically takes over.
 */
const FIELD_DEPLOYMENT_STEPS: TutorialStep[] = [
  {
    id: "fd-nav",
    path: "/vehicle-requests",
    target: "nav-vehicle-requests",
    role: "Everyone",
    title: "Missions hub",
    body:
      "Field deployments start here under Requests (missions): define the mission with dates, destination, and required vehicle class. Logistics rows can attach after approval. This tour follows the happy path through reservation, driver check, and trip checkout — watch the role badge when responsibility shifts.",
    suggestion:
      "A sandbox mission and TUT- demo vehicle are created for this track (or reused if you run it again). They are deleted when you finish or exit the tutorial. Look for “Tutorial sandbox — practice checkout” in your mission list.",
  },
  {
    id: "fd-new-mission",
    path: "/vehicle-requests",
    target: "tutorial-vr-request-btn",
    role: "Planner / requester",
    title: "1. Submit a new mission",
    body:
      "Open + New mission and complete the form: choose Field deployment when the run needs a departing driver checklist and mission-linked trip gates. Include required vehicle class and R&R dates so management can approve the plan.",
  },
  {
    id: "fd-mission-form",
    path: "/vehicle-requests",
    target: "tutorial-vr-form",
    role: "Planner / requester",
    title: "2. Mission details",
    body:
      "The mission record is the source of truth for approval and fleet reservation. After submit, the mission waits for management approval before anyone can reserve a specific vehicle or start a trip.",
    suggestion: "If the form is closed, tap + New mission again to match this highlight.",
  },
  {
    id: "fd-mgmt-approve",
    path: "/vehicle-requests",
    target: "tutorial-vr-pending-approval",
    role: "Management approver",
    title: "3. Approve the mission",
    body:
      "Users with mission approval permission see pending missions here. Approve when the plan is valid; reject with a clear reason if not. Drivers and fleet only proceed once the mission is approved.",
    suggestion: "This card appears only when there are pending missions and your role can approve.",
  },
  {
    id: "fd-fleet-reserve",
    path: "/vehicle-requests",
    target: "tutorial-vr-fleet-reserve",
    role: "Fleet manager / lead",
    title: "4. Reserve a vehicle on the mission",
    body:
      "Fleet picks a concrete pool vehicle for each approved mission. The system blocks overlapping active reservations on the same unit, and blocks holding a vehicle past its registration disc expiry through the mission’s last day unless an authorised user enters the override reason (same field as overlap; 8+ characters, audit-logged). If the reserved vehicle is not operational at checkout, fleet can reassign, place a checkout hold (alerts management), or defer.",
    suggestion: "This section is visible when your role can allocate vehicles and there are approved missions to reserve.",
  },
  {
    id: "fd-calendar",
    path: "/fleet-reservations",
    target: "tutorial-deployment-calendar",
    role: "Fleet / visibility",
    title: "5. Reservation calendar",
    body:
      "Use the calendar-style list to see which vehicles are held for which missions in a month. It complements the pool view and helps avoid double-booking across teams.",
  },
  {
    id: "fd-dvc-start",
    path: "/vehicle-checks",
    target: "tutorial-vehicle-checks-new",
    role: "Departing driver",
    title: "6. Departing driver checklist (field)",
    body:
      "For Field deployment missions, complete today’s driver vehicle check for the reserved unit before checkout. Local / HQ-vicinity missions skip this gate in trip readiness. Submit the check, then return to Trips to create the trip.",
    suggestion: "Open Vehicle checks from the sidebar if needed.",
  },
  {
    id: "fd-dvc-form",
    path: "/vehicle-checks",
    target: "tutorial-dvc-form",
    role: "Departing driver",
    title: "7. Complete the checklist",
    body:
      "Fill direction, vehicle, odometer and photos, pass/fail lines, equipment, and submit. Failed items may require manager approval per your organisation’s rules.",
  },
  {
    id: "fd-trips-open",
    path: "/trips",
    target: "tutorial-trips-checkout",
    role: "Driver / dispatcher",
    title: "8. Open Create trip",
    body:
      "Trips are always created from an approved mission that already has a reserved vehicle. Tap + Create Trip to open mission checkout — you cannot pick a random pool vehicle here.",
    suggestion: "The tutorial opens this panel automatically on the next steps.",
  },
  {
    id: "fd-checkout-form",
    path: "/trips",
    target: "tutorial-trip-checkout-card",
    role: "Driver / dispatcher",
    title: "9. Mission checkout form",
    body:
      "Select the mission, confirm the reserved vehicle, enter driver name and odometer, route, and load. If fleet or management edits mission parameters materially, the mission may return to pending approval before the trip can be created.",
  },
  {
    id: "fd-readiness",
    path: "/trips",
    target: "tutorial-trip-readiness-gates",
    role: "Driver / dispatcher",
    title: "10. Trip readiness & create",
    body:
      "Readiness shows driver checklist (field), vehicle operational state, registration disc versus mission dates, and other gates. Fix blockers or use a logged override when policy allows (mission approvers: same cohort as overlap). Then submit to start the trip — your deployment is live until check-in.",
    suggestion: "Gates appear after a mission with a reserved vehicle is selected.",
  },
  {
    id: "fd-loadout",
    path: "/trips",
    target: "tutorial-trips-loadout-manifests",
    role: "Driver / logistics",
    title: "11. Load-out manifests (AM)",
    body:
      "Link Asset Management packing lists to the active trip from the trip row below. Manifests are authored in AM; Fleet Hub stores the link for the field team.",
  },
  {
    id: "fd-arbitration",
    path: "/vehicle-requests",
    target: "tutorial-vr-arbitration",
    role: "Management (capacity)",
    title: "12. If capacity conflicts (optional)",
    body:
      "When not enough operational vehicles exist, management may defer or cancel missions or reassign capacity. Fleet cannot decide which approved mission loses a slot — that arbitration sits here for eligible roles.",
    suggestion: "Visible only if your role has capacity arbitration permission.",
  },
  {
    id: "fd-dashboard-alerts",
    path: "/",
    target: "tutorial-dashboard-panels",
    role: "Management / oversight",
    title: "13. Dashboard alerts (checkout hold)",
    body:
      "If the reserved unit is not operational and fleet places a checkout hold, or if registration discs are nearing expiry, high-severity alerts surface on the dashboard so management can act (deferral, another vehicle, renewal, or a logged override where policy allows).",
  },
];

/** Request a vehicle from the pool */
const VEHICLE_REQUEST_STEPS: TutorialStep[] = [
  {
    id: "vr-intro",
    path: "/vehicle-requests",
    target: "nav-vehicle-requests",
    title: "Mission and vehicle workflow",
    body:
      "Create a mission (profile, required vehicle class, dates); management approves it. Approved drivers add a logistics row and pick the designated driver from the EHS-approved list for the organisation. The fleet team lead reserves a specific pool vehicle on the mission (watch for overlap and registration disc gates). Switch to Vehicle Pool to see availability.",
  },
  {
    id: "vr-button",
    path: "/vehicle-requests",
    target: "tutorial-vr-request-btn",
    title: "1. New mission",
    body:
      "Tap + New mission to open the form. Stay on the Requests tab to see logistics rows; fleet sees approved missions to reserve vehicles.",
  },
  {
    id: "vr-form",
    path: "/vehicle-requests",
    target: "tutorial-vr-form",
    title: "2. Mission form + driver row",
    body:
      "Step 1: submit a mission with profile, required vehicle class, and R&R for approval. Step 2 (drivers): link an approved mission, choose designated driver from the register search, purpose and priority; vehicle class comes from the mission when set. Fleet reserves the concrete vehicle on the mission after line approval (override reason if overlap or registration disc blocks).",
  },
  {
    id: "vr-route",
    path: "/vehicle-requests",
    target: "tutorial-vr-route-estimate",
    title: "3. Route distance and fuel",
    body:
      "Choosing a destination from the site list shows an estimated one-way driving distance (mapped roads). After a vehicle is assigned, the request shows fuel (L) and efficiency from that vehicle’s consumption—manual L/100 km on the vehicle if set, otherwise a typical value from the reference table. Admins set GPS per site and the fleet HQ start under Admin.",
    suggestion: "Select a site in the destination dropdown to see the distance update.",
  },
  {
    id: "vr-pool",
    path: "/vehicle-requests",
    target: "tutorial-vr-pool-toggle",
    title: "4. Vehicle pool (fleet lead)",
    body:
      "Fleet team leads use the Vehicle Pool tab for operational snapshots; they reserve a vehicle on each approved mission from the mission list or request detail when linked to a mission. The same override box covers overlapping bookings and registration disc exceeded — only for users who can approve mission requests, with an 8+ character reason.",
  },
];

/** Link AM load-out manifests to trips */
const LOADOUT_MANIFEST_STEPS: TutorialStep[] = [
  {
    id: "loadout-intro",
    path: "/trips",
    target: "tutorial-trips-checkout",
    title: "Trips and AM load-outs",
    body:
      "Fleet Hub records check-out and check-in. Operations build packing lists in Asset Management (am.1pwrafrica.com). Use the section below to tie those manifests to a trip.",
    suggestion: "Open Trips from the sidebar if you are not already here.",
  },
  {
    id: "loadout-section",
    path: "/trips",
    target: "tutorial-trips-loadout-manifests",
    title: "Load-out manifests (AM)",
    body:
      "Listed manifests are linked by trip ID. Open in AM shows the full packing list. Paste a manifest document ID from Asset Management to link (optional trip label). Unlink clears the association. Line items and editing stay in AM; link/unlink needs Manager-level permission.",
  },
];

/** Country / organisation changes (vehicle record vs approvals) */
const COUNTRY_TRANSFER_STEPS: TutorialStep[] = [
  {
    id: "ct-intro",
    path: "/vehicles",
    target: "nav-vehicle-country-changes",
    title: "Country & organisation transfers",
    body:
      "Vehicles are registered to an organisation (country). Use this workflow to fix a wrong assignment or to record a secondment or permanent transfer—with the right approvals.",
    suggestion: "Open Country transfers from the sidebar, or start from any vehicle’s detail page.",
  },
  {
    id: "ct-approvals",
    path: "/vehicle-country-changes",
    target: "tutorial-country-transfers-page",
    title: "Approval queue",
    body:
      "Pending requests appear here. Fleet leads approve simple corrections; C-level approves real cross-border transfers that include mission and inspection evidence.",
  },
  {
    id: "ct-open-vehicle",
    path: "/vehicles",
    target: "tutorial-vehicles-first-link",
    title: "Open a vehicle",
    body:
      "From the register, open any vehicle code to reach its detail page. Submissions start from the vehicle, not from the approvals queue.",
    suggestion: "Tap Next after you navigate to Vehicles, then open a row if you want to follow along.",
  },
  {
    id: "ct-vehicle-card",
    path: "/vehicles",
    target: "tutorial-vehicle-country-card",
    title: "Country / organisation on the vehicle",
    body:
      "The card shows the current registration. Request change opens a form: choose data correction, secondment, or permanent transfer, explain why, and attach mission and mechanical inspection when required.",
    suggestion: "Stay on a vehicle detail page for this step—the highlight targets the Country / organisation card.",
  },
  {
    id: "ct-inspection",
    path: "/vehicles",
    target: "nav-inspections",
    title: "Mechanical inspection for transfers",
    body:
      "Real transfers need a passed mechanical checklist (Detailed or Cross-border transfer type) and a linked trip. Complete inspections under Inspections before submitting.",
  },
];

/** EHS approved drivers register: country filter → HR loader → add → licence/tests → back to check form */
const EHS_DRIVER_REGISTER_STEPS: TutorialStep[] = [
  {
    id: "ehs-intro",
    path: "/ehs-approved-drivers",
    target: "nav-ehs-approved-drivers",
    title: "EHS approved drivers register",
    body:
      "This workflow shows how the EHS team curates the list of drivers who may use fleet vehicles. The register is country-scoped per organisation and feeds the vehicle-check driver dropdown and vehicle requests.",
    suggestion:
      "Everyone signed in to Fleet Hub can view this page. Adding, editing, or removing drivers requires the EHS department (synced from PR) or an admin role.",
  },
  {
    id: "ehs-page",
    path: "/ehs-approved-drivers",
    target: "tutorial-ehs-page",
    title: "1. Open Approved drivers (EHS)",
    body:
      "The page lists every driver already on the register for this organisation, plus a loader for adding people from the HR directory. Each driver card is green (Ready for fleet use) only when licence, four tests, and licence file all check out.",
  },
  {
    id: "ehs-country-filter",
    path: "/ehs-approved-drivers",
    target: "tutorial-ehs-country-filter",
    title: "2. Load HR by country",
    body:
      "Country-aware: enter the ISO code (e.g. LS, ZM, BJ) to pull only employees for that country, then click Load employees from HR. The register is per organisation so a driver approved in Lesotho is not automatic in Zambia.",
    suggestion: "Skip the filter to load everyone, but expect a larger list.",
  },
  {
    id: "ehs-hr-picker",
    path: "/ehs-approved-drivers",
    target: "tutorial-ehs-hr-picker",
    title: "3. Pick and add",
    body:
      "Search the loaded list by name, email, or employee ID, pick the person, then click Add to register. Anyone already listed is disabled in the dropdown so you don’t duplicate them.",
  },
  {
    id: "ehs-drivers-list",
    path: "/ehs-approved-drivers",
    target: "tutorial-ehs-drivers-list",
    title: "4. Driver cards",
    body:
      "New entries appear here with empty licence and test dates. Green (Ready for fleet use) means every rule is satisfied; amber (Incomplete) means something is missing — open the card to see which field.",
  },
  {
    id: "ehs-license",
    path: "/ehs-approved-drivers",
    target: "tutorial-ehs-license-upload",
    title: "5. Upload the licence scan",
    body:
      "At least one licence file is required. Upload here on the card. The two-year continuity rule is checked against the valid-from and expiry dates below — the card shows a short hint when they pass.",
    suggestion: "If no driver card is visible, add one from the HR loader first.",
  },
  {
    id: "ehs-tests",
    path: "/ehs-approved-drivers",
    target: "tutorial-ehs-tests-grid",
    title: "6. Licence dates and status",
    body:
      "Enter the licence valid-from / expiry and set Status = active. The licence continuity hint turns green once the dates satisfy the two-year rule.",
  },
  {
    id: "ehs-assessments",
    path: "/ehs-approved-drivers",
    target: "tutorial-ehs-assessments",
    title: "7. Five assessments (Pass / Fail / Pending)",
    body:
      "Vision, Hearing, Reaction, Written (off-road) and Practical each have a three-state toggle. Flip them to Pass once EHS has verified the test result. Every change clears the attestation — the card reverts to Draft until re-signed.",
  },
  {
    id: "ehs-authorizations",
    path: "/ehs-approved-drivers",
    target: "tutorial-ehs-authorizations",
    title: "8. D018 authorizations matrix",
    body:
      "The accordion groups the 16 D018 categories (Driving / Plant / Machining). Set each grant to None, Approved, or Trainer. Plant and machining categories also need a training-record upload on the authorisation row before Save authorization unlocks.",
  },
  {
    id: "ehs-attest",
    path: "/ehs-approved-drivers",
    target: "tutorial-ehs-attest",
    title: "9. Tick to attest and save",
    body:
      "EHS confirms the record by ticking 'I confirm the assessments, licence, and authorizations above are accurate' and pressing Attest and save. The header banner turns to 'Attested by …' and the record is Ready for fleet use until the next edit.",
  },
  {
    id: "ehs-effect-checks",
    path: "/vehicle-checks",
    target: "tutorial-dvc-form",
    title: "10. How the register shows up on a vehicle check",
    body:
      "The Driver field on the check form is a searchable dropdown of operators who are ready for the selected vehicle's class (standard on-road, heavy vehicle, tractor, etc.). Non-listed names can still be written in but are flagged amber. Suspending or changing an authorisation in EHS updates this dropdown immediately.",
  },
];

/** Personal vehicle reimbursement (F006): submit a claim from attachments through approval and CSV export. */
const PVR_STEPS: TutorialStep[] = [
  {
    id: "pvr-intro",
    path: "/personal-vehicle-reimbursement",
    target: "nav-personal-vehicle-reimbursement",
    title: "Personal vehicle reimbursement",
    body:
      "Submit an F006 mileage claim when no fleet vehicle is available. This tour walks through eligibility, attachments, trip details, manager approval, and the finance export.",
    suggestion: "Open Personal vehicle claim from the sidebar.",
  },
  {
    id: "pvr-page",
    path: "/personal-vehicle-reimbursement",
    target: "tutorial-pvr-page",
    title: "1. Open the page",
    body:
      "The page shows an Eligibility banner, a New claim button, and your existing claims list below. Each claim needs an approved mission and correct trip dates. When fleet vehicles are in the pool, Notes must document an override or approvers cannot sign off.",
  },
  {
    id: "pvr-eligibility",
    path: "/personal-vehicle-reimbursement",
    target: "tutorial-pvr-eligibility",
    title: "2. Eligibility banner",
    body:
      "Green means no operational fleet vehicles in the pool — submit with a linked mission. Amber means vehicles exist; you can still submit if Notes document a formal override (min length). Approvers cannot approve claims submitted while vehicles were available unless those Notes qualify.",
  },
  {
    id: "pvr-attachments",
    path: "/personal-vehicle-reimbursement",
    target: "tutorial-pvr-attachments",
    title: "3. Attach evidence first",
    body:
      "Submit stays disabled until at least one attachment is uploaded. Include the current valid insurance plus odometer photos (or a route screenshot). Optional fuel / toll / parking receipts help finance during audits.",
    suggestion: "Use the camera button on phones to capture the odometer without leaving the form.",
  },
  {
    id: "pvr-trip-details",
    path: "/personal-vehicle-reimbursement",
    target: "tutorial-pvr-trip-details",
    title: "4. Trip details",
    body:
      "Choose the pre-approved mission first, then set the trip date within that mission’s dates, plus destination, purpose, kilometres (per-km mode), and optional notes. The estimated LSL previews using your organisation's per-km rate (Admin → PVR rates).",
  },
  {
    id: "pvr-claims",
    path: "/personal-vehicle-reimbursement",
    target: "tutorial-pvr-claims",
    title: "5. Claims list & approval",
    body:
      "Submitted claims appear below. Managers tap Approve — the card turns green and the LSL total locks. Reject bounces it back with a reason. Editing after approval re-opens the claim (sign-off cleared, same pattern as the EHS register).",
  },
  {
    id: "pvr-export",
    path: "/reports",
    target: "nav-reports",
    title: "6. Finance export",
    body:
      "Finance pulls 'Personal vehicle reimbursement claims (finance)' from Reports. Only approved claims are included; the date filter at the top of Reports limits the output.",
  },
];

/** Field report → work order: file an issue and follow it through to a work order. */
const FIELD_ISSUE_STEPS: TutorialStep[] = [
  {
    id: "fi-intro",
    path: "/report-issue",
    target: "nav-report-issue",
    title: "Field issue → work order",
    body:
      "Use Report Issue when something goes wrong on the road and a full inspection is not practical. This tour walks through filing, attaching photos, and watching the issue become a work order.",
    suggestion: "Open Report Issue from the sidebar.",
  },
  {
    id: "fi-page",
    path: "/report-issue",
    target: "tutorial-report-issue-page",
    title: "1. Open Report Issue",
    body:
      "The header and success banner live above the form. A ticket ID appears here once your submission is saved so you can refer to it later.",
  },
  {
    id: "fi-form",
    path: "/report-issue",
    target: "tutorial-report-issue-form",
    title: "2. Fill the form",
    body:
      "Pick the vehicle, give a short title, describe the problem, and set a severity. Attach photos; the camera button opens the rear camera on phones. Submit saves a field_report row that the fleet team can triage.",
  },
  {
    id: "fi-nav-work-orders",
    path: "/work-orders",
    target: "nav-work-orders",
    title: "3. Where it lands next",
    body:
      "Fleet leads and mechanics see field reports alongside work orders. They can convert a field report into a work order in one click — photos, description, and reporter carry over, with a status of 'submitted'.",
  },
  {
    id: "fi-follow-up",
    path: "/work-orders",
    target: "tutorial-work-orders-header",
    title: "4. Follow the job",
    body:
      "Once converted, the usual work-order flow takes over: status transitions, labour hours, parts, status history, and close-out. The originating field report stays linked for audit.",
  },
];

/** Create a work order */
const WORK_ORDER_STEPS: TutorialStep[] = [
  {
    id: "wo-intro",
    path: "/work-orders",
    target: "nav-work-orders",
    title: "Create a work order",
    body:
      "Work orders track repair jobs: vehicle, title, description, type, priority, assignment, and repair location.",
  },
  {
    id: "wo-button",
    path: "/work-orders",
    target: "tutorial-work-orders-create-btn",
    title: "1. New work order",
    body:
      "Tap + New Work Order to open the creation form. The list below shows existing jobs you can open for detail.",
  },
  {
    id: "wo-form",
    path: "/work-orders",
    target: "tutorial-wo-create-form",
    title: "2. Fill job details",
    body:
      "Choose vehicle, title, and description. Set type (corrective, inspection-flagged, etc.), priority, assign a mechanic if known, and repair location (HQ vs third party).",
  },
  {
    id: "wo-after",
    path: "/work-orders",
    target: "tutorial-work-orders-header",
    title: "3. After creation",
    body:
      "The new job appears in the list. Open it to post updates, labour, parts, PR/PO links, and status—including needs-parts and PR submitted when procurement is in flight—through to completion.",
  },
];

export const TUTORIAL_TRACKS: Record<string, TutorialTrack> = {
  overview: { id: "overview", label: "Full app tour", steps: OVERVIEW_STEPS },
  fieldDeployment: {
    id: "fieldDeployment",
    label: "Field deployment (end-to-end)",
    steps: FIELD_DEPLOYMENT_STEPS,
  },
  driverCheck: { id: "driverCheck", label: "Driver vehicle check", steps: DRIVER_CHECK_STEPS },
  vehicleInspection: {
    id: "vehicleInspection",
    label: "Mechanical inspection",
    steps: VEHICLE_INSPECTION_STEPS,
  },
  vehicleRequest: { id: "vehicleRequest", label: "Request a vehicle", steps: VEHICLE_REQUEST_STEPS },
  ehsDriverRegister: {
    id: "ehsDriverRegister",
    label: "EHS approved drivers register",
    steps: EHS_DRIVER_REGISTER_STEPS,
  },
  workOrder: { id: "workOrder", label: "Create a work order", steps: WORK_ORDER_STEPS },
  fieldIssueToWorkOrder: {
    id: "fieldIssueToWorkOrder",
    label: "Field issue → work order",
    steps: FIELD_ISSUE_STEPS,
  },
  loadoutManifest: {
    id: "loadoutManifest",
    label: "Load-out manifests (AM)",
    steps: LOADOUT_MANIFEST_STEPS,
  },
  countryTransfer: {
    id: "countryTransfer",
    label: "Country / organisation transfers",
    steps: COUNTRY_TRANSFER_STEPS,
  },
  personalVehicleReimbursement: {
    id: "personalVehicleReimbursement",
    label: "Personal vehicle reimbursement (F006)",
    steps: PVR_STEPS,
  },
};

const TUTORIAL_TRACK_LABELS_FR: Record<string, string> = {
  overview: "Parcours complet de l'application",
  fieldDeployment: "Deploiement terrain (de bout en bout)",
  driverCheck: "Controle conducteur du vehicule",
  vehicleInspection: "Inspection mecanique",
  vehicleRequest: "Demander un vehicule",
  ehsDriverRegister: "Registre des conducteurs EHS approuves",
  workOrder: "Creer un ordre de travail",
  fieldIssueToWorkOrder: "Incident terrain -> ordre de travail",
  loadoutManifest: "Manifeste de chargement (AM)",
  countryTransfer: "Transferts pays / organisation",
  personalVehicleReimbursement: "Remboursement vehicule personnel (F006)",
};

export const TUTORIAL_TRACK_ORDER: string[] = [
  "overview",
  "fieldDeployment",
  "driverCheck",
  "ehsDriverRegister",
  "vehicleInspection",
  "vehicleRequest",
  "countryTransfer",
  "workOrder",
  "fieldIssueToWorkOrder",
  "loadoutManifest",
  "personalVehicleReimbursement",
];

/** @deprecated Use TUTORIAL_TRACKS.overview.steps */
export const TUTORIAL_STEPS = OVERVIEW_STEPS;

export function getTutorialTracks(locale: TutorialLocale = "en"): Record<string, TutorialTrack> {
  if (locale !== "fr") return TUTORIAL_TRACKS;
  return Object.fromEntries(
    Object.entries(TUTORIAL_TRACKS).map(([id, track]) => [
      id,
      {
        ...track,
        label: TUTORIAL_TRACK_LABELS_FR[id] ?? track.label,
        steps: track.steps.map((step) => {
          const tr = TUTORIAL_STEP_TRANSLATIONS_FR[step.id] as Partial<TutorialStepLocaleFields> | undefined;
          if (!tr) return step;
          return {
            ...step,
            ...tr,
          };
        }),
      },
    ])
  );
}

export function getTutorialSteps(trackId: string, locale: TutorialLocale = "en"): TutorialStep[] {
  const tracks = getTutorialTracks(locale);
  return tracks[trackId]?.steps ?? tracks.overview.steps;
}

export function getTutorialTrackLabel(trackId: string, locale: TutorialLocale = "en"): string {
  const tracks = getTutorialTracks(locale);
  return tracks[trackId]?.label ?? tracks.overview.label;
}

/** Sidebar `data-tutorial` id for a nav href (e.g. /vehicles → nav-vehicles). */
export function navDataTutorialHref(href: string): string {
  if (href === "/" || href === "") return "nav-dashboard";
  return `nav-${href.replace(/^\//, "").replace(/\//g, "-")}`;
}

/** When the app is on `path`, highlight this nav target while waiting for navigation. */
export function pathToNavTarget(path: string): string {
  return navDataTutorialHref(path);
}
