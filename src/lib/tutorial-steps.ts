/**
 * Interactive tutorial: each step highlights a [data-tutorial] target and can suggest sample inputs.
 * Tutorial-created DB rows use vehicle codes prefixed with TUT- and are removed on exit (see /api/tutorial/cleanup).
 */

export interface TutorialStep {
  id: string;
  /** App route where the target element exists (or should exist after navigation). */
  path: string;
  /** Value of data-tutorial="…" on the highlighted element. */
  target: string;
  title: string;
  body: string;
  /** Example values or hints for forms — shown in the tooltip. */
  suggestion?: string;
  /** If true, POST /api/tutorial/seed runs when this step is entered (demo vehicle for CRUD demos). */
  seedOnEnter?: boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
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
      "Teams request vehicles; managers approve and assign from the operational pool. Use the pool view for capacity.",
  },
  {
    id: "nav-map",
    path: "/vehicle-requests",
    target: "nav-map",
    title: "Fleet map",
    body:
      "Live or last-known GPS positions (where trackers are fitted). From a marker you can open the vehicle or active trip.",
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

/** Sidebar `data-tutorial` id for a nav href (e.g. /vehicles → nav-vehicles). */
export function navDataTutorialHref(href: string): string {
  if (href === "/" || href === "") return "nav-dashboard";
  return `nav-${href.replace(/^\//, "").replace(/\//g, "-")}`;
}

/** When the app is on `path`, highlight this nav target while waiting for navigation. */
export function pathToNavTarget(path: string): string {
  return navDataTutorialHref(path);
}
