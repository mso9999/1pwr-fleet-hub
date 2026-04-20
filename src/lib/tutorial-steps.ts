/**
 * Interactive tutorials: each step highlights [data-tutorial] targets.
 * Multiple tracks: full app overview + focused workflow walkthroughs.
 */

export interface TutorialStep {
  id: string;
  path: string;
  target: string;
  title: string;
  body: string;
  suggestion?: string;
  seedOnEnter?: boolean;
}

export interface TutorialTrack {
  id: string;
  /** Shown in the tutorials menu */
  label: string;
  steps: TutorialStep[];
}

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
      "These tiles summarise how many vehicles are operational, deployed, in maintenance, awaiting parts, or grounded.",
  },
  {
    id: "dashboard-panels",
    path: "/",
    target: "tutorial-dashboard-panels",
    title: "Trips & work orders at a glance",
    body:
      "Active trips and recent open work orders surface here. Open the full pages from the sidebar for detail and actions.",
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
    id: "nav-trips",
    path: "/vehicles",
    target: "nav-trips",
    title: "Trips & missions",
    body:
      "Check out records mission profiling: driver, route, loadout, and return. Check-in captures odometer and issues.",
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
      "Work orders track repairs: status, assignee, labour, parts, and links to purchase requests where applicable.",
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
      "Teams request vehicles; managers approve and assign from the operational pool. Site destinations get a mapped driving-distance hint; fuel estimates appear after assignment.",
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

/** Request a vehicle from the pool */
const VEHICLE_REQUEST_STEPS: TutorialStep[] = [
  {
    id: "vr-intro",
    path: "/vehicle-requests",
    target: "nav-vehicle-requests",
    title: "Vehicle request workflow",
    body:
      "Request a vehicle for a dated mission. Managers approve and may assign a vehicle from the operational pool. Switch to Vehicle Pool to see availability.",
  },
  {
    id: "vr-button",
    path: "/vehicle-requests",
    target: "tutorial-vr-request-btn",
    title: "1. New request",
    body:
      "Tap + Request vehicle to open the request form. Stay on the Requests tab to see your team’s submissions.",
  },
  {
    id: "vr-form",
    path: "/vehicle-requests",
    target: "tutorial-vr-form",
    title: "2. Fill the request",
    body:
      "Enter who it’s for, purpose, destination, dates, and priority. Submit sends it into the approval flow.",
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
    title: "4. Vehicle pool (managers)",
    body:
      "Managers can switch to the Vehicle Pool tab to see operational vehicles and assign after approval.",
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
    title: "6. Licence dates and four tests",
    body:
      "Fill the licence valid-from / expiry and the four pass dates (written, road, eye, reaction). Set Status = active and Save. Once everything is filled and the licence passes continuity, the card turns green.",
  },
  {
    id: "ehs-effect-checks",
    path: "/vehicle-checks",
    target: "tutorial-dvc-form",
    title: "7. How the register shows up on a vehicle check",
    body:
      "The Driver field on the check form is a searchable dropdown of fully compliant drivers for this organisation — non-listed names can still be written in but are flagged amber. Suspending or removing a driver in EHS removes them from this dropdown.",
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
      "The new job appears in the list. Open it to post updates, labour, parts links, and status changes through to completion.",
  },
];

export const TUTORIAL_TRACKS: Record<string, TutorialTrack> = {
  overview: { id: "overview", label: "Full app tour", steps: OVERVIEW_STEPS },
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
};

export const TUTORIAL_TRACK_ORDER: string[] = [
  "overview",
  "driverCheck",
  "ehsDriverRegister",
  "vehicleInspection",
  "vehicleRequest",
  "countryTransfer",
  "workOrder",
  "loadoutManifest",
];

/** @deprecated Use TUTORIAL_TRACKS.overview.steps */
export const TUTORIAL_STEPS = OVERVIEW_STEPS;

export function getTutorialSteps(trackId: string): TutorialStep[] {
  return TUTORIAL_TRACKS[trackId]?.steps ?? TUTORIAL_TRACKS.overview.steps;
}

export function getTutorialTrackLabel(trackId: string): string {
  return TUTORIAL_TRACKS[trackId]?.label ?? TUTORIAL_TRACKS.overview.label;
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
