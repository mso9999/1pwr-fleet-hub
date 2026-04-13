import type { GuideContent } from "./types";

const L = (href: string, label: string) => ({ type: "link" as const, href, label });
const B = (text: string) => ({ type: "strong" as const, text });

export const guideEn: GuideContent = {
  index: {
    title: "User guide",
    intro:
      "In-app help for 1PWR Fleet Hub. Open a topic below; each page matches what you see on screen. Use the EN / FR toggle in the header to switch language.",
    tutorialTitle: "Interactive tutorial",
    tutorialBody: [
      [
        "Step through the main workflows with on-screen highlights: dashboard, vehicles, trips, checks, work orders, map, analytics, reports, and daily update. A temporary demo vehicle (code starting with ",
        B("TUT-"),
        ") is created for the register walkthrough and removed when you finish or exit.",
      ],
    ],
    tutorialButton: "Tutorial mode",
    tutorialOr: "Or open the app with",
    tutorialQuery: "?tutorial=1",
    sections: [
      {
        href: "/guide/getting-started",
        title: "Getting started",
        description: "Sign-in, organization, language, and how the main areas of Fleet Hub fit together.",
      },
      {
        href: "/guide/daily-workflows",
        title: "Common daily workflows",
        description: "Trips, vehicle checks, reporting issues, work orders, daily update, and reports.",
      },
      {
        href: "/guide/fleet-and-map",
        title: "Dashboard, fleet map & vehicles",
        description: "KPIs, live map, vehicle registry, and vehicle detail.",
      },
      {
        href: "/guide/vehicle-checks",
        title: "Driver vehicle checks",
        description: "Pre-trip checklist, equipment, failures, and management approval for exceptions.",
      },
      {
        href: "/guide/inspections",
        title: "Vehicle inspection checklists",
        description: "Formal inspections: types, Pass/Warn/Fail, photos, body diagram, and work orders.",
      },
      {
        href: "/guide/maintenance-and-work",
        title: "Work orders, maintenance & mechanics",
        description: "WO lifecycle, scheduled maintenance, mechanic activity, and triage.",
      },
      {
        href: "/guide/insights-and-field",
        title: "TCO, reports, daily update & field",
        description: "Analytics exports, field reports, triage, and admin reference data.",
      },
    ],
    tipTitle: "Tip",
    tipParagraphs: [
      [
        "Bookmark this page on your phone or tablet. Inspections and vehicle checks use large touch targets where possible (",
        B("Pass"),
        ", ",
        B("Warn"),
        ", ",
        B("Fail"),
        ").",
      ],
      ["Production URL: ", B("fm.1pwrafrica.com")],
    ],
    productionUrl: "fm.1pwrafrica.com",
  },

  gettingStarted: {
    title: "Getting started",
    subtitle: "What you need to use Fleet Hub day to day.",
    sections: [
      {
        id: "sign-in",
        title: "Sign in",
        paragraphs: [
          [
            "Open Fleet Hub in the browser (e.g. ",
            B("fm.1pwrafrica.com"),
            "). Use your 1PWR email and password. You can also choose ",
            B("Fleet Management"),
            " on the login screen to stay in this app (or open the PR system if your workflow requires it).",
          ],
          [
            "Your profile and permissions are synchronized from the same identity layer as other 1PWR tools. If sign-in fails, confirm your account with IT and that this domain is allowed.",
          ],
        ],
      },
      {
        id: "language",
        title: "English / French",
        paragraphs: [
          [
            "Use the ",
            B("EN / FR"),
            " toggle in the top bar (next to Tutorial mode) to switch the interface language. The user guide follows the same language.",
          ],
        ],
      },
      {
        id: "organization",
        title: "Organization",
        paragraphs: [
          [
            "If you see an organization dropdown at the bottom of the sidebar, choose the entity you are working for (e.g. Lesotho, Zambia). ",
            B("Dashboard"),
            ", vehicles, trips, inspections, and reports are filtered to that organization.",
          ],
        ],
      },
      {
        id: "sidebar",
        title: "Main areas (sidebar)",
        paragraphs: [],
        bullets: [
          "Dashboard — fleet snapshot, KPIs, active trips, open work orders, recent activity.",
          "Fleet Map — live or last-known vehicle positions where tracking is enabled.",
          "Vehicles — browse assets; open a vehicle for specifications, history, and GPS.",
          "Trips — check-out / check-in style trip logging with odometer and route.",
          "Vehicle Checks — mandatory driver checklist before deployment; failures may need manager approval.",
          "Work Orders — maintenance and repair jobs (often linked from failed inspections).",
          "Maintenance — scheduled service and due dates.",
          "Mechanics — activity and assignment views.",
          "Triage — prioritize issues and capacity (per team process).",
          "Requests — vehicle pool requests and assignments.",
          "Daily Update — generated text for WhatsApp or email updates.",
          "TCO & Analytics — cost and performance views.",
          "Reports — CSV exports for analysis.",
          "Inspections — structured vehicle checklists (distinct from quick vehicle checks).",
          "User guide — this documentation.",
          "Report Issue — quick field report when something is wrong on the road.",
          "Admin — reference data sync and vehicle-check approver settings (role-restricted).",
        ],
      },
      {
        id: "tutorial",
        title: "Tutorial mode",
        paragraphs: [
          [
            "From the header, ",
            B("Tutorial mode"),
            " walks the UI with highlights. Use ",
            L("/?tutorial=1", "Dashboard with tutorial"),
            " to start directly.",
          ],
        ],
      },
    ],
  },

  dailyWorkflows: {
    title: "Common daily workflows",
    subtitle: "Short how-tos for routine tasks.",
    sections: [
      {
        id: "trips",
        title: "Trips",
        paragraphs: [
          [
            "Use ",
            L("/trips", "Trips"),
            " to check out a vehicle: odometer start, destination, mission type, and optional load details. When you return, complete ",
            B("check-in"),
            " with end odometer and any issues so distance and fleet status stay accurate.",
          ],
        ],
      },
      {
        id: "vehicle-checks",
        title: "Vehicle checks (driver checklist)",
        paragraphs: [
          [
            "Open ",
            L("/vehicle-checks", "Vehicle Checks"),
            " and complete a check before deployment. You choose ",
            B("Leaving HQ"),
            " or ",
            B("Returning to HQ"),
            ", then pass/fail each line and confirm equipment (jack, triangle, spare, etc.).",
          ],
          [
            "If any line fails, describe it. Multiple failures may require ",
            B("manager approval"),
            " before the vehicle is cleared—see the vehicle checks guide.",
          ],
        ],
      },
      {
        id: "report-issue",
        title: "Report a field issue",
        paragraphs: [
          [
            L("/report-issue", "Report Issue"),
            " is for urgent or notable problems in the field (breakdown, damage, safety). It complements inspections and may feed into work orders depending on process.",
          ],
        ],
      },
      {
        id: "work-orders",
        title: "Work orders",
        paragraphs: [
          [
            L("/work-orders", "Work Orders"),
            " lists jobs by status. Failed ",
            B("inspection"),
            " lines on a ",
            B("new"),
            " submission can create a high-priority work order automatically; mechanics pick them up from there.",
          ],
        ],
      },
      {
        id: "maintenance",
        title: "Maintenance",
        paragraphs: [
          [
            L("/maintenance", "Maintenance"),
            " shows scheduled maintenance and overdue items so nothing is missed between trips.",
          ],
        ],
      },
      {
        id: "requests",
        title: "Vehicle requests",
        paragraphs: [
          [
            L("/vehicle-requests", "Requests"),
            " is where teams request vehicles from the pool; managers approve and assign an operational vehicle.",
          ],
        ],
      },
      {
        id: "pvr",
        title: "Personal vehicle reimbursement",
        paragraphs: [
          [
            L("/personal-vehicle-reimbursement", "Personal vehicle claim"),
            " is for F006-style reimbursement when no fleet vehicle is available for assignment: upload insurance and mileage evidence, manager approves, and finance exports CSV from Reports.",
          ],
        ],
      },
      {
        id: "daily-update",
        title: "Daily update",
        paragraphs: [
          [
            L("/daily-update", "Daily Update"),
            " generates a text summary from current fleet data—copy it into WhatsApp or email for leadership updates.",
          ],
        ],
      },
      {
        id: "triage",
        title: "Triage",
        paragraphs: [
          [
            L("/triage", "Triage"),
            " supports prioritization views for HQ or leads (capacity and flagged vehicles)—use as your team defines.",
          ],
        ],
      },
      {
        id: "reports",
        title: "Reports and exports",
        paragraphs: [
          [
            "Under ",
            L("/reports", "Reports"),
            ", download CSV exports. Inspections export includes checklist detail—use date filters where offered.",
          ],
        ],
      },
      {
        id: "inspections-link",
        title: "Inspections (detail)",
        paragraphs: [
          [
            "For the full inspection checklist walkthrough, see ",
            L("/guide/inspections", "Vehicle inspection checklists"),
            ".",
          ],
        ],
      },
    ],
  },

  vehicleChecks: {
    title: "Driver vehicle checks",
    subtitle: "Pre-deployment checklist and exception approvals.",
    sections: [
      {
        id: "purpose",
        title: "Purpose",
        paragraphs: [
          [
            "Vehicle checks are the operational gate before a vehicle leaves HQ (or when returning). They capture electrics, fluids, driveability, visual items, and required equipment.",
          ],
        ],
      },
      {
        id: "flow",
        title: "How to complete a check",
        paragraphs: [],
        bullets: [
          "Open Vehicle Checks → + New vehicle check.",
          "Choose Leaving HQ or Returning to HQ.",
          "Select the vehicle, enter driver name, mileage (optional), and route from / to.",
          "For each status line, tap ✓ (pass) or ✗ (fail). If you fail, describe the issue in the text box.",
          "For each equipment line, tap Yes or No.",
          "Add remarks if needed, then Submit.",
        ],
      },
      {
        id: "exceptions",
        title: "Failures and management approval",
        paragraphs: [
          [
            "If you fail one or more items, the app warns that ",
            B("manager approval"),
            " may be required before deployment. Your organization may designate specific approvers (from HR) in Admin; fleet lead, manager, and admin roles can also approve in-app.",
          ],
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              "Submitting with failures records the check. A manager with permission can tap ",
              B("Approve exceptions"),
              " on the check card when exceptions are pending.",
            ],
          ],
        },
      },
      {
        id: "equipment",
        title: "Equipment notes",
        paragraphs: [
          [
            "Missing equipment is logged (e.g. triangle, jack). Follow local policy on whether the vehicle may still depart.",
          ],
        ],
      },
    ],
  },

  fleetAndMap: {
    title: "Dashboard, fleet map & vehicles",
    subtitle: "Understand fleet status at a glance and drill into each asset.",
    sections: [
      {
        id: "dashboard",
        title: "Dashboard",
        paragraphs: [
          [
            "The ",
            L("/", "Dashboard"),
            " shows KPIs (uptime, MTTR, MTBF, open work orders, active trips), a breakdown of vehicles by status, alerts, active trips, open work orders, recent activity, and a quick grid of all vehicles.",
          ],
        ],
      },
      {
        id: "map",
        title: "Fleet map",
        paragraphs: [
          [
            L("/map", "Fleet Map"),
            " shows vehicle positions on a map when GPS data is available. Use it for situational awareness and coordination.",
          ],
        ],
      },
      {
        id: "vehicles",
        title: "Vehicles",
        paragraphs: [
          [
            L("/vehicles", "Vehicles"),
            " lists every vehicle for the selected organization. Open a vehicle to see details, status, trips, inspections, work orders, and tracking information where configured.",
          ],
        ],
      },
      {
        id: "trips-link",
        title: "Trips",
        paragraphs: [
          [
            "Use ",
            L("/trips", "Trips"),
            " to log journeys. Vehicle checks are often required before the first trip of the day—see the vehicle checks guide.",
          ],
        ],
      },
    ],
  },

  maintenanceAndWork: {
    title: "Work orders, maintenance & mechanics",
    subtitle: "Keeping the fleet maintained and jobs visible.",
    sections: [
      {
        id: "work-orders",
        title: "Work orders",
        paragraphs: [
          [
            L("/work-orders", "Work Orders"),
            " track jobs from reported or inspection-flagged issues through completion. Status and priority show what needs attention first.",
          ],
        ],
      },
      {
        id: "maintenance",
        title: "Scheduled maintenance",
        paragraphs: [
          [
            L("/maintenance", "Maintenance"),
            " lists scheduled maintenance and helps ensure services are not missed.",
          ],
        ],
      },
      {
        id: "mechanics",
        title: "Mechanics",
        paragraphs: [
          [
            L("/mechanics", "Mechanics"),
            " supports views of mechanic activity and workload.",
          ],
        ],
      },
      {
        id: "triage",
        title: "Triage",
        paragraphs: [
          [
            L("/triage", "Triage"),
            " helps fleet leads sort and prioritize issues across vehicles.",
          ],
        ],
      },
      {
        id: "inspections-wo",
        title: "Inspections → work orders",
        paragraphs: [
          [
            "When a ",
            B("new"),
            " inspection is submitted with ",
            B("Fail"),
            " lines, the system can create a high-priority work order summarizing failed items. ",
            B("Warn"),
            " alone does not auto-create a work order.",
          ],
        ],
        callout: {
          variant: "warning",
          paragraphs: [
            [
              "Editing an old inspection later does not create new work orders—only the initial submission drives automation.",
            ],
          ],
        },
      },
    ],
  },

  insightsAndField: {
    title: "TCO, reports, daily update & field",
    subtitle: "Analytics, exports, leadership updates, and field reporting.",
    sections: [
      {
        id: "tco",
        title: "TCO & Analytics",
        paragraphs: [
          [
            L("/tco", "TCO & Analytics"),
            " provides cost and performance analytics for fleet decision-making.",
          ],
        ],
      },
      {
        id: "reports",
        title: "Reports",
        paragraphs: [
          [
            L("/reports", "Reports"),
            " offers CSV exports for spreadsheets and audits. Filter by type and date where available.",
          ],
        ],
      },
      {
        id: "daily-update",
        title: "Daily update",
        paragraphs: [
          [
            L("/daily-update", "Daily Update"),
            " builds a narrative summary from live data—useful for operational briefings.",
          ],
        ],
      },
      {
        id: "report-issue",
        title: "Report issue",
        paragraphs: [
          [
            L("/report-issue", "Report Issue"),
            " captures field problems quickly when a full inspection is not practical.",
          ],
        ],
      },
      {
        id: "admin",
        title: "Admin (reference data & approvers)",
        paragraphs: [
          [
            L("/admin", "Admin"),
            " is for users with permission: manage dropdown reference data (sites, departments, mission types, shops) and sync lists from the PR app Firestore where configured.",
          ],
          [
            "Fleet admins can also configure ",
            B("who may approve vehicle check exceptions"),
            " by loading employees from the HR directory and selecting approvers (matched by email).",
          ],
        ],
      },
    ],
  },

  inspections: {
    title: "Vehicle inspection checklists",
    subtitle: "Walkthrough aligned with the Inspections screen.",
    sections: [
      {
        id: "before-you-start",
        title: "Before you start",
        paragraphs: [],
        bullets: [
          "Sign in with your 1PWR email. If the app keeps loading, check your connection or ask IT to confirm your account.",
          "If you have more than one organization, choose it at the bottom of the sidebar; vehicle lists follow that choice.",
          "The vehicle dropdown only lists vehicles synced for that organization. If a truck is missing, fleet admin may need to sync or add it first.",
        ],
      },
      {
        id: "open-inspections",
        title: "1. Open Inspections",
        paragraphs: [
          [
            "In the left menu, open ",
            L("/inspections", "Inspections"),
            ". You will see saved checklists (newest first) and ",
            B("+ New inspection"),
            " at the top.",
          ],
        ],
      },
      {
        id: "start-new",
        title: "2. Start a new checklist",
        paragraphs: [
          [
            "Tap ",
            B("+ New inspection"),
            ". The form opens on the same page—nothing is saved until you submit.",
          ],
        ],
      },
      {
        id: "choose-type",
        title: "3. Choose the checklist type",
        paragraphs: [
          ["Use the three tabs at the top of the form:"],
        ],
        bullets: [
          "Pre-departure (quick) — shorter list focused on safety before a trip (lights, fluids, tires, cab checks, etc.).",
          "Detailed mechanical — everything in the quick list plus deeper mechanical items (brakes, suspension, drivetrain, and more).",
          "1PWR checklist (2025) — full — the full structured checklist for proficiency / compliance-style reviews.",
        ],
      },
      {
        id: "switching",
        title: "Switching types",
        paragraphs: [
          [
            "Switching type clears ratings and notes on the current draft so you do not mix templates by mistake.",
          ],
        ],
      },
      {
        id: "vehicle-inspector",
        title: "4. Vehicle and inspector",
        paragraphs: [],
        bullets: [
          "Vehicle * — required. Choose the correct code; the record is tied to that vehicle for history and work orders.",
          "Inspector name * — required. Enter your name as it should appear on the record.",
        ],
      },
      {
        id: "rate-lines",
        title: "5. Complete each line (Pass / Warn / Fail)",
        paragraphs: [
          ["Each row is one checklist item, grouped by category (Exterior, Fluids, Engine, etc.)."],
        ],
        bullets: [
          "Pass (✓) — item is OK. Default if you do not change anything.",
          "Warn (!) — needs attention soon but not an immediate safety failure. Add a short note if helpful.",
          "Fail (✗) — failed or unsafe. You must add a line note, at least one photo for that row, or a note on a body-plan mark before submit.",
        ],
      },
      {
        id: "body-plan",
        title: "Body plan (top view)",
        paragraphs: [
          [
            "On body-related lines, a plan-view diagram may appear. Tap to place ",
            B("X"),
            " marks and add a short description for each mark. Saved inspections show the diagram when you expand a card.",
          ],
        ],
      },
      {
        id: "auto-wo",
        title: "Automatic work order",
        callout: {
          variant: "warning",
          paragraphs: [
            [
              "When you ",
              B("submit a new"),
              " inspection, any line marked ",
              B("Fail"),
              " triggers creation of a ",
              B("high-priority"),
              " work order for that vehicle. ",
              B("Warn"),
              " alone does not create a work order. Editing an old inspection later does not create new work orders.",
            ],
          ],
        },
      },
      {
        id: "submit",
        title: "6. Submit",
        paragraphs: [],
        bullets: [
          "Tap Submit inspection when finished. Wait for completion; then the form closes and your checklist appears in the list.",
          "Tap Cancel to close without saving.",
          "Overall result is pass if there are no Fail lines; any Fail marks the inspection as failed overall.",
        ],
      },
      {
        id: "after-saved",
        title: "7. After it is saved",
        paragraphs: [],
        bullets: [
          "Expand a card — tap the header to show every line, rating, and note.",
          "Edit — change vehicle, inspector, or any line; save updates the record.",
          "Delete — permanently removes that inspection after confirmation.",
          "Export — use Reports for CSV exports.",
        ],
      },
    ],
  },
};
