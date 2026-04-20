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
        "Step through the main workflows with on-screen highlights: dashboard, vehicles, trips (including load-out manifests from Asset Management), checks, work orders, map, analytics, reports, and daily update. A temporary demo vehicle (code starting with ",
        B("TUT-"),
        ") is created for the register walkthrough and removed when you finish or exit.",
      ],
      [
        "Focused tracks cover driver checks, mechanical inspections, vehicle requests (including route and fuel hints), work orders, and ",
        B("load-out manifests (AM)"),
        " — linking packing lists to trips.",
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
        description:
          "Trips (including AM load-out manifests), vehicle checks, reporting issues, work orders, vehicle requests (route and fuel hints), daily update, and reports.",
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
        href: "/guide/ehs-approved-drivers",
        title: "EHS approved drivers register",
        description:
          "Who may drive fleet vehicles: HR-sourced list, licence dates, four tests (written, road, eye, reaction), and how it drives the check and request flows.",
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
        description: "Analytics exports, field reports, triage, admin reference data, and GPS for sites / route start.",
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
          "Approved drivers (EHS) — register of drivers eligible to operate fleet vehicles (licence + four tests). Visible to everyone signed in; only EHS department users and admins can edit.",
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
          "Admin — reference data sync, vehicle-check approvers, and (finance/superadmin) personal-vehicle reimbursement rates.",
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
          [
            "Load-out manifests (AM): operations prepare packing lists in ",
            B("Asset Management"),
            " (am.1pwrafrica.com). On each trip, the ",
            B("Load-out manifests (AM)"),
            " section lists manifests linked to that trip and offers ",
            B("Open in AM"),
            " for the full list. To associate a manifest, paste its document ID from Asset Management (optional trip label). ",
            B("Link"),
            " and ",
            B("Unlink"),
            " require Manager-level permission; details and line items stay in Asset Management.",
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
          [
            "Only drivers on the ",
            L("/guide/ehs-approved-drivers", "EHS approved-drivers register"),
            " may submit a request (superadmin excepted). If a request is blocked because you are not on the register, ask EHS to add you.",
          ],
          [
            "When you choose a ",
            B("destination"),
            " from the site list, Fleet Hub estimates ",
            B("one-way driving distance"),
            " along roads (public routing). Free-text “Other” destinations do not get a mapped distance.",
          ],
          [
            "After a vehicle is ",
            B("assigned"),
            ", the request card shows an ",
            B("estimated fuel"),
            " volume and efficiency (L/100 km and US MPG) using that vehicle’s consumption: a manual value on the vehicle record if set, otherwise a typical figure from the built-in reference table by make, model, and year.",
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
          "Select the vehicle, pick the driver from the approved list, enter mileage (optional), and route from / to.",
          "For each status line, tap ✓ (pass) or ✗ (fail). If you fail, describe the issue in the text box.",
          "For each equipment line, tap Yes or No.",
          "Add remarks if needed, then Submit.",
        ],
      },
      {
        id: "driver-picker",
        title: "Driver picker (EHS approved drivers)",
        paragraphs: [
          [
            "The Driver field is a searchable dropdown backed by the ",
            L("/guide/ehs-approved-drivers", "EHS approved-drivers register"),
            " for the current organisation. Only fully compliant drivers (licence + all four tests + licence file on record) appear in the list.",
          ],
          [
            "If the signed-in user is on the list, the field is pre-filled. A typed name that does not match a registered driver is accepted as a ",
            B("write-in"),
            " and flagged amber under the field — EHS should add that person to the register if they will be driving regularly.",
          ],
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

  ehsApprovedDrivers: {
    title: "EHS approved drivers register",
    subtitle:
      "How EHS maintains the list of drivers who may operate 1PWR fleet vehicles, and how it drives checks and requests.",
    sections: [
      {
        id: "purpose",
        title: "Purpose",
        paragraphs: [
          [
            "The ",
            L("/ehs-approved-drivers", "Approved drivers (EHS)"),
            " register is the authoritative list of people allowed to operate fleet vehicles for an organisation. The ",
            B("EHS department"),
            " curates this list from the HR directory, records licence evidence and four test pass dates, and sets each driver’s status.",
          ],
          [
            "Fleet Hub uses the register in two places: the ",
            L("/guide/vehicle-checks", "driver vehicle check"),
            " (driver picker) and ",
            L("/guide/daily-workflows", "vehicle requests"),
            " (requester must be on the register).",
          ],
        ],
      },
      {
        id: "who",
        title: "Who sees and edits the register",
        bullets: [
          "View: any signed-in Fleet Hub user — the register is read-only for everyone so drivers can confirm their status and requesters can see who is eligible.",
          "Edit: EHS department users (PR department = EHS) or admins only. Managers and fleet leads see the register but cannot change dates, upload licences, or add / remove people.",
          "HR employee loader at the top of the page is still restricted to EHS, fleet management, and admins (it exposes the HR directory, which contains PII).",
        ],
      },
      {
        id: "country-aware",
        title: "Country-aware list",
        paragraphs: [
          [
            "The register is scoped per organisation (= country: Lesotho / Zambia / Benin). A driver approved in one country does not automatically appear in another — EHS must add them in each organisation where they drive.",
          ],
          [
            "The HR loader at the top of the page supports an optional ",
            B("country filter"),
            " (e.g. ",
            B("LS"),
            ", ",
            B("ZM"),
            ", ",
            B("BJ"),
            ") to narrow the employee list before you pick someone to add.",
          ],
        ],
      },
      {
        id: "add-driver",
        title: "Adding a driver from HR",
        paragraphs: [],
        bullets: [
          "Open Approved drivers (EHS) in the sidebar.",
          "Under ‘Add driver from HR directory’, enter an optional country filter and click Load employees from HR.",
          "Search the loaded list by name, email, or employee ID.",
          "Pick the employee in the Employee dropdown. Entries already on the register are marked ‘(already listed)’.",
          "Click Add to register. The new card appears below, starting with empty licence and test dates.",
        ],
      },
      {
        id: "licence-and-tests",
        title: "Licence and four tests",
        paragraphs: [
          [
            "For each driver card, EHS fills and saves:",
          ],
        ],
        bullets: [
          "License valid from / License expiry (dates on the physical licence).",
          "Written test pass date.",
          "Road test pass date.",
          "Eye test pass date.",
          "Reaction test pass date.",
          "At least one licence scan uploaded under ‘License scan (upload)’.",
          "Status — active (can drive) or suspended (temporarily blocked).",
          "Notes — internal (optional).",
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              B("Two-year continuity rule: "),
              "the licence’s valid-from date must be at least two years before today, and the expiry must not be in the past. The card shows a short green/amber hint confirming whether the licence dates pass this rule.",
            ],
          ],
        },
      },
      {
        id: "ready-for-use",
        title: "Ready for fleet use",
        paragraphs: [
          [
            "A driver is considered ",
            B("fully compliant"),
            " — and appears in the vehicle-check driver dropdown — when ",
            B("all"),
            " of the following are true:",
          ],
        ],
        bullets: [
          "Status is active.",
          "At least one licence scan is attached.",
          "All four test pass dates are filled.",
          "Licence dates pass the two-year continuity rule and the expiry is not in the past.",
        ],
        callout: {
          variant: "success",
          paragraphs: [
            [
              "Cards in green (Ready for fleet use) satisfy every rule. Cards in amber (Incomplete) are missing something — open them to see which field to fix.",
            ],
          ],
        },
      },
      {
        id: "suspending",
        title: "Suspending or removing a driver",
        paragraphs: [
          [
            "To temporarily block a driver (e.g. licence expiring, medical issue) change ",
            B("Status"),
            " to ",
            B("suspended"),
            " and Save. They drop out of the vehicle-check dropdown and are no longer eligible to submit vehicle requests.",
          ],
          [
            "Use ",
            B("Remove from register"),
            " only when a person should no longer be on the list at all (left the organisation, permanently revoked).",
          ],
        ],
      },
      {
        id: "effects",
        title: "What the register controls",
        bullets: [
          "Vehicle check form → Driver field: only fully-compliant drivers for this organisation appear in the dropdown. Typed write-ins are accepted but flagged amber.",
          "Vehicle requests → the signed-in user must be on the register (superadmin excepted). The API returns a clear error if they are not.",
          "Admin → Vehicle-check approvers is a separate list (who may approve exception failures on a check). Being an approver does not by itself make someone an approved driver.",
        ],
      },
      {
        id: "troubleshooting",
        title: "Troubleshooting",
        bullets: [
          "Driver does not appear in the check dropdown → open their card and check status = active, all four test dates filled, at least one licence file attached, licence dates pass the two-year rule.",
          "‘Not on the EHS approved list’ warning under the Driver field → EHS has not added this person for the current organisation, or they are suspended.",
          "HR list is empty → the loader is only visible to EHS, fleet management, and admins; click Load employees from HR (optionally with a country filter) if the buttons are available. The HR Portal may be slow for the first call after a deploy.",
          "Can’t see the page at all → sign in to Fleet Hub; the register is visible to every signed-in user. Only the edit controls require EHS / admin rights.",
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
          [
            "Link load-out packing lists from Asset Management under each trip’s ",
            B("Load-out manifests (AM)"),
            " section (see ",
            L("/guide/daily-workflows", "Common daily workflows"),
            ").",
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
          [
            "Users with the ",
            B("finance"),
            " or ",
            B("superadmin"),
            " role can set ",
            B("personal vehicle reimbursement financial rates"),
            " (per-km and HQ basis); others see built-in defaults until those are saved.",
          ],
          [
            "For accurate ",
            B("route distance"),
            " on requests, admins should set ",
            B("GPS coordinates"),
            " on each ",
            B("site / destination"),
            " (Sites in Admin): use ",
            B("Set GPS"),
            " with the map picker or enter latitude and longitude. Eligible roles can also set ",
            B("Trip route start (fleet HQ)"),
            " so the driving route starts from your operating base; if unset, defaults apply.",
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
