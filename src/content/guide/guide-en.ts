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
        title: "EHS approved operator register (D018)",
        description:
          "Who may operate 1PWR vehicles and equipment: HR-sourced list, licence + five assessments, 16-category authorisations matrix, and per-record EHS sign-off.",
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
        href: "/guide/personal-vehicle-reimbursement",
        title: "Personal vehicle reimbursement (F006)",
        description:
          "Submit mileage claims when no fleet vehicle is available: eligibility, attachments, manager approval, finance CSV export.",
      },
      {
        href: "/guide/country-transfers",
        title: "Country / organisation transfers",
        description:
          "Fix a miscoded country, register a secondment, or approve a cross-border transfer with the right role and evidence.",
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
          "Approved drivers (EHS) — D018 operator register: licence + five assessments (vision, hearing, reaction, written, practical), 16-category authorisations, and EHS sign-off. Visible to everyone signed in; only EHS department users and admins can edit.",
          "Work Orders — maintenance and repair jobs (often linked from failed inspections).",
          "Maintenance — scheduled service and due dates.",
          "Mechanics — activity and assignment views.",
          "Triage — prioritise open work orders with §9 scoring (keep HQ / review / 3rd party) and capacity flags.",
          "Requests — vehicle pool requests and assignments.",
          "Country transfers — approval queue for data corrections, secondments, and permanent cross-border moves.",
          "Personal vehicle claim — F006-style mileage claim when no fleet vehicle is available; manager approves and finance exports CSV.",
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
    title: "EHS approved operator register (D018)",
    subtitle:
      "How EHS maintains the list of operators who may use 1PWR fleet vehicles and equipment, with per-record sign-off and the D018 authorizations matrix.",
    sections: [
      {
        id: "purpose",
        title: "Purpose",
        paragraphs: [
          [
            "The ",
            L("/ehs-approved-drivers", "Approved drivers (EHS)"),
            " page is the Fleet Hub home of 1PWR’s ",
            B("D018 Approved Operator List"),
            ". It replaces the standalone spreadsheet: the ",
            B("EHS department"),
            " captures five physical and proficiency assessments, uploads licence and training evidence, sets each person’s authorisation across 16 equipment categories, and signs off every record.",
          ],
          [
            "Fleet Hub uses the register at two gates: the ",
            L("/guide/vehicle-checks", "driver vehicle check"),
            " picker (filtered to the authorisation that matches the selected vehicle class) and ",
            L("/guide/daily-workflows", "vehicle requests"),
            " (requester must be cleared as a fleet vehicle operator).",
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
        title: "Licence and five assessments",
        paragraphs: [
          [
            "Each operator card carries a licence block and five ",
            B("Pass / Fail / Pending"),
            " assessments. EHS switches each assessment through the three states directly on the card — every change clears the attestation and the card reverts to Draft until re-signed.",
          ],
        ],
        bullets: [
          "License valid from / License expiry (dates on the physical licence).",
          "Licence scan upload (at least one file on file).",
          "Physical assessment: Vision, Hearing, Reaction.",
          "Proficiency: Written (off-road) and Practical.",
          "Status — active (may operate) or suspended (temporarily blocked).",
          "Notes — free text (e.g. 'Automatic vehicles only').",
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              B("Two-year continuity rule: "),
              "for standard on-road vehicles, the licence valid-from date must be at least two years before today and the expiry must not be in the past. Other categories relax or waive this rule (heavy-vehicle training, for example, takes precedence).",
            ],
          ],
        },
      },
      {
        id: "authorizations",
        title: "D018 authorizations matrix",
        paragraphs: [
          [
            "Under the card’s ",
            B("Authorizations (D018)"),
            " accordion, each of the sixteen categories from the spreadsheet appears once. For every category EHS picks a grant — ",
            B("None"),
            ", ",
            B("Approved"),
            ", or ",
            B("Trainer"),
            " — adds optional notes, and uploads a training record where required.",
          ],
        ],
        bullets: [
          "Driving: Insured 1PWR vehicle on public roads, Heavy vehicle on public roads, Motorcycle on public roads, LDF Defensive driving.",
          "Plant / heavy equipment: Off-road vehicle (ATV / moto), Telehandler / Forklift / TLB, Excavator, Drill rig, Tractor, Crane.",
          "Machine shop: CNC milling, Manual milling / turning, CNC plasma cutting, MIG welder, TIG welder, Machine shop general.",
          "Trainer implies Approved — a trainer is also cleared to operate and can supervise others.",
          "A training record upload is mandatory for any plant or machining category (Save authorization stays disabled until the file is attached).",
        ],
      },
      {
        id: "ready-for-use",
        title: "When an operator is 'ready'",
        paragraphs: [
          [
            "The green ",
            B("Ready"),
            " badge on an authorisation row only lights up when every rule for that category passes:",
          ],
        ],
        bullets: [
          "Status is active and the record is attested (green sign-off line on top of the card).",
          "Vision, Hearing, Reaction, and Practical are Pass (Written is also required for off-road, plant, and machining).",
          "Licence scan on file, plus the two-year continuity rule where the category requires it.",
          "Training record on file for the authorisation (plant and machining categories).",
          "Grant for the category is Approved or Trainer.",
        ],
        callout: {
          variant: "success",
          paragraphs: [
            [
              "Cards show ",
              B("Ready (fleet vehicle)"),
              " at the top when the default on-road rule passes. Switching the selected vehicle class on the vehicle-check form re-queries the register for that category, so the driver picker is always scoped to who is cleared for that specific vehicle.",
            ],
          ],
        },
      },
      {
        id: "sign-off",
        title: "EHS sign-off",
        paragraphs: [
          [
            "Every card ends with an attestation block: a mandatory checkbox (",
            B("I confirm the assessments, licence, and authorizations above are accurate"),
            ") plus an ",
            B("Attest and save"),
            " button.",
          ],
          [
            "Saving the tri-state assessments / licence dates writes the record and attests in one step when the box is ticked. Any subsequent edit — on the card or on an individual authorisation row — clears the attestation; EHS has to re-tick and re-save. This matches the D018 'Approved by MSO YYYY-MM-DD' pattern but per record rather than per document.",
          ],
        ],
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
          "Driver does not appear in the check dropdown → open their card, switch the assessments to Pass, confirm the grant for the expected category (e.g. fleet vehicle on-road) is Approved or Trainer, and that the record is re-attested.",
          "‘Not on the EHS approved list’ warning under the Driver field → EHS has not added or authorised this person for the specific vehicle class you selected (heavy vehicles need a separate authorisation row from standard on-road).",
          "Ready badge missing on an authorisation → check the category’s own requirements (training record upload, written test for plant / machining).",
          "HR list is empty → the loader is only visible to EHS, fleet management, and admins; click Load employees from HR (optionally with a country filter) if the buttons are available.",
          "Record shows Draft after an edit → this is by design; tick the attestation checkbox and hit Attest and save to bring it back to Ready.",
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
            " plots live and last-known vehicle positions on an interactive map. Markers are colour-coded by status (operational, deployed, maintenance, grounded). Tap a marker to open its pop-up with vehicle code, driver (if on an active trip), last fix time, and shortcuts into the vehicle detail or the active trip.",
          ],
        ],
        bullets: [
          "Site overlays: configured sites (HQ, destinations) appear as pins so you can see how far a vehicle is from base.",
          "Trail / history: recent trip breadcrumbs render when available, so you can replay how a vehicle reached its current point.",
          "Country framing: the map auto-frames on the organisation picked in the sidebar — switch country to re-frame.",
          "Tracker gaps: a vehicle with no recent fix shows as 'last known' — good for coordination but not real-time.",
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              "Map accuracy depends on two admin inputs: ",
              B("per-site GPS"),
              " (sites → Set GPS) and the ",
              B("trip route start (fleet HQ)"),
              ". Without those, distance estimates on vehicle requests fall back to org defaults.",
            ],
          ],
        },
      },
      {
        id: "vehicles",
        title: "Vehicles",
        paragraphs: [
          [
            L("/vehicles", "Vehicles"),
            " lists every vehicle for the selected organisation. Filter by ",
            B("status"),
            ", ",
            B("category (asset class)"),
            ", ",
            B("home location"),
            ", ",
            B("current location"),
            ", and ",
            B("pool"),
            " at the top of the table. Click a code to open the vehicle detail page with dashboard tabs.",
          ],
          [
            B("Changing operational / under-maintenance status: "),
            "Open the vehicle and use the ",
            B("Quick Status Change"),
            " card. The lifecycle is: ",
            B("operational"),
            " (automatic when free), ",
            B("deployed"),
            " (automatic when a trip starts; reverts to operational on check-in), ",
            B("diagnosis"),
            " (pre-WO investigation \u2014 free to set, no work order required), then one of ",
            B("maintenance-hq"),
            ", ",
            B("maintenance-3rdparty"),
            ", ",
            B("awaiting-parts"),
            ", or ",
            B("grounded"),
            " \u2014 each of those four ",
            B("requires an open work order"),
            " specifying the parts and assignee. If you try to set one without an open WO the system blocks the change and offers to open a WO or set ",
            B("diagnosis"),
            " instead. ",
            B("written-off"),
            " requires management sign-off (admin / fleet management / executive / finance / superadmin) and a written reason recorded in the audit trail.",
          ],
          [
            B("Closing a work order does not auto-revert the vehicle. "),
            "If one WO closes but a separate issue is found, fleet stays in the workshop status while a new WO is created. Use Quick Status Change to confirm the next state.",
          ],
          [
            B("Work orders list on the vehicle: "),
            "The Work orders card on the vehicle detail page is a sortable, paginated table. Open WOs are pinned to the top; completed rows sort by date completed (descending) by default. Click any column header to switch the sort.",
          ],
        ],
        bullets: [
          "Quick Status Change (detail page): use this whenever a vehicle moves between operational, diagnosis, workshop, awaiting-parts, grounded, or written-off. The system enforces the open-WO rule and the management sign-off rule.",
          "Overview tab: spec sheet (make / model / year / licence plate / VIN / engine number), asset class, home and current location, fuel type, transmission, drivetrain.",
          "TCO tab: purchase price, in-service date, total mileage, service intervals, cost-to-date, end-of-life score.",
          "History tab: trips, inspections, work orders filtered to this vehicle (with quick links).",
          "Tracker tab: GPS provider, IMEI / SIM, current status, last fix time, and recent tracking-report CSV summary.",
          "Country / organisation card (detail page): this is where you submit a country-transfer request (see Country transfers article).",
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
            " is the workload view for HQ workshop staff. It surfaces who is currently assigned, labour hours logged, and a per-mechanic activity feed so fleet leads can balance jobs.",
          ],
        ],
        bullets: [
          "Assigned-to me: each mechanic sees their open work orders at the top with status badges.",
          "Labour log: quick-add hours against a job without opening the full work-order detail panel.",
          "Activity feed: status transitions and updates from the last few days, so a shift handover can read one screen and catch up.",
          "Workload: simple counts of open work orders per mechanic to spot bottlenecks.",
        ],
      },
      {
        id: "triage",
        title: "Triage",
        paragraphs: [
          [
            L("/triage", "Triage"),
            " ranks open work orders by the 1PWR §9 scoring rule so fleet leads can decide which jobs to keep at HQ and which to send to a third-party shop. The table shows the composite score plus the four inputs it came from.",
          ],
        ],
        bullets: [
          "Parts ready — are the parts on site or on order / in-transit (from the linked PRs cache)?",
          "Operational urgency — how much does the fleet rely on this vehicle right now (status, mission priority).",
          "HQ skill match — does HQ have the right skills / equipment to fix this class of problem?",
          "Days waiting — older work orders get a bump so they don't starve.",
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              B("Thresholds: "),
              "above 70 = keep at HQ; 40–70 = review with a mechanic; below 40 = consider sending to a 3rd-party shop. The capacity toggle flags jobs beyond current HQ capacity.",
            ],
          ],
        },
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
            " gives fleet management a cost and performance view per vehicle and per cohort (asset class, year, pool). Metrics are built from vehicle records, trips, work-order labour/parts/third-party costs, and scheduled maintenance.",
          ],
        ],
        bullets: [
          "Per-vehicle TCO: purchase price, repair cost, insurance, and expected life; highlight vehicles running over budget.",
          "End-of-life (EOL) score: combines mileage vs expected life, cost-per-km trend, and recent reliability to flag candidates for replacement.",
          "Cohort performance: compare 4WD vs cargo-truck vs tractor vs plant, or by year / pool / location, for sourcing decisions.",
          "Export to CSV via Reports if you want to slice further in a spreadsheet.",
        ],
      },
      {
        id: "reports",
        title: "Reports",
        paragraphs: [
          [
            L("/reports", "Reports"),
            " offers downloadable CSVs. Set an optional date range at the top (applies to trips and work orders); the vehicle registry ignores it. Every row below is a click-to-download link.",
          ],
        ],
        bullets: [
          "Work orders (with downtime days) — one row per work order with status, priority, assignee, cost breakdown, downtime days.",
          "Vehicle registry — current spec + status + location for every vehicle in the organisation.",
          "Trips — check-out / check-in pairs with odometer, route, driver, mission type.",
          "Cost summary by vehicle — labour + parts + third-party totals aggregated per code.",
          "Inspections / checklists — every line, rating, note, and photo count from structured inspections.",
          "TCO & EOL analysis — purchase price, repair cost, EOL score, flagged statuses.",
          "Driver vehicle checks (pre-deployment) — one row per check with pass/fail per line and exception status.",
          "Scheduled maintenance — intervals, last done, next due, overdue flag.",
          "Vehicle allocation requests — status, destination, assigned vehicle, fuel estimate, rent-return flag.",
          "Personal vehicle reimbursement claims (finance) — only approved claims; used by finance for payroll.",
        ],
      },
      {
        id: "daily-update",
        title: "Daily update",
        paragraphs: [
          [
            L("/daily-update", "Daily Update"),
            " composes a short text summary (vehicles down, jobs opened / closed, trips in progress, alerts) that fleet leads paste into the daily WhatsApp / email briefing.",
          ],
        ],
        bullets: [
          "Generate — builds the text from live data at the moment you click; no scheduling required.",
          "Edit — the output is plain text in a textarea, so you can tweak the opening line, add context, or redact before copying.",
          "Copy — one-click copy to clipboard; language follows the EN / FR toggle.",
          "Signing off — leave the generator open through the day and re-generate when you need an updated snapshot.",
        ],
      },
      {
        id: "report-issue",
        title: "Report issue (field reports)",
        paragraphs: [
          [
            L("/report-issue", "Report Issue"),
            " is the field-first way to flag a problem when filling a full inspection is not practical (breakdown, damage, suspicious noise, safety concern). It's quicker than Inspections and can be converted into a work order by fleet / mechanics afterwards.",
          ],
        ],
        bullets: [
          "Pick the vehicle, a short title, a description, and a severity.",
          "Attach photos — camera-capture works on phones so you can take the shot without leaving the form.",
          "Submit — a field_report row is saved and appears in the Mechanics / Work Orders triage views so HQ can decide to convert it.",
          "Convert to work order — managers open the field report and hit 'Convert to work order'; the photos and description carry across with a status of 'submitted'.",
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              "Field reports and driver vehicle checks serve different purposes. Use a ",
              B("check"),
              " before a planned trip (structured list). Use a ",
              B("report"),
              " when something unexpected happens on the road.",
            ],
          ],
        },
      },
      {
        id: "admin",
        title: "Admin (reference data, approvers, rates, GPS)",
        paragraphs: [
          [
            L("/admin", "Admin"),
            " is role-gated: reference data is editable by fleet admins and superadmins; PVR rates are finance / superadmin only; approvers are fleet admins. Everyone else sees the page but without editing controls.",
          ],
        ],
        bullets: [
          "Reference data — edit sites, departments, mission types, and third-party shop lists used in dropdowns across the app.",
          "Sync from PR — pull the shared reference lists from the PR app's Firestore (one click; read-only sync, doesn't write back).",
          "Vehicle-check approvers — load employees from the HR directory and pick who may approve failed vehicle-check exceptions (matched by email).",
          "Personal-vehicle reimbursement rates — per-km and HQ-basis LSL rate by organisation; built-in defaults apply until a custom rate is saved.",
          "Fleet mechanics — canonical roster behind the Work Order Assign-to / Worker pickers. Edit access: admin, fleet management (fleet_lead / manager), and PR departments DPO / HR / IT / Fleet (EHS excluded). Every create / update / delete / status change is recorded in an append-only mutation log visible per-record.",
          "Site GPS — open each site and Set GPS via the map picker or lat/long. Needed for accurate driving-distance estimates on vehicle requests.",
          "Trip route start (fleet HQ) — the coordinate the routing engine uses as the starting point for mapped distance on a vehicle request; org-level fallback when vehicle/mission origin is unknown.",
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              B("Mutation log: "),
              "Fleet mechanics and the EHS approved operator register both write every change (actor, role, department, before / after snapshot, optional reason) into a shared append-only audit table. Open the View history button on any record to inspect it.",
            ],
          ],
        },
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

  personalVehicleReimbursement: {
    title: "Personal vehicle reimbursement (F006)",
    subtitle:
      "Submit, approve, and export 1PWR personal-vehicle mileage claims when no fleet vehicle is available for assignment.",
    sections: [
      {
        id: "purpose",
        title: "Purpose",
        paragraphs: [
          [
            L("/personal-vehicle-reimbursement", "Personal vehicle claim"),
            " replaces the F006 spreadsheet for cases where a 1PWR fleet vehicle could not be assigned and the employee drove their own car. Eligibility is checked server-side, the manager approves in-app, and finance exports approved claims as CSV.",
          ],
        ],
      },
      {
        id: "eligibility",
        title: "Eligibility",
        paragraphs: [
          [
            "The ",
            B("Eligibility"),
            " panel at the top of the page tells you whether you can submit right now. A claim is blocked while the fleet has an operational vehicle available for the trip window — this is deliberate: personal-vehicle use is a fall-back, not a preference.",
          ],
        ],
        bullets: [
          "Green 'Eligible' → go ahead and submit.",
          "Amber 'Blocked' → a fleet vehicle is available; use Requests to book one instead.",
          "Manager / admin override: managers can still approve claims that were submitted before eligibility changed.",
        ],
      },
      {
        id: "attachments",
        title: "1. Attach evidence before you submit",
        paragraphs: [
          [
            "Upload the supporting documents first — the submit button only unlocks when they are attached:",
          ],
        ],
        bullets: [
          "Current valid vehicle insurance (image or PDF).",
          "Odometer photo(s) at start and end of the trip (or a route-tracking screenshot).",
          "Optional: fuel receipt, toll slip, or parking receipt — anything finance will want in an audit.",
        ],
      },
      {
        id: "trip-details",
        title: "2. Trip details",
        bullets: [
          "Trip date (required).",
          "Route from / Route to — pick sites from the dropdown, or type a free-text location.",
          "Purpose — mirrors a vehicle-request purpose so reports reconcile.",
          "Kilometres — round-trip total; the form multiplies by the per-km rate to show the estimated LSL.",
          "Notes — anything unusual (detour, waiting time, escort, etc.).",
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              "The rate shown is the current ",
              B("per-km rate for your organisation"),
              " from Admin → PVR rates (finance / superadmin edit). You see the built-in default until a custom rate is saved.",
            ],
          ],
        },
      },
      {
        id: "approval",
        title: "3. Manager approval",
        paragraphs: [
          [
            "Each claim posts as ",
            B("submitted"),
            ". A manager (or admin) reviews the card and taps ",
            B("Approve"),
            " — the card turns green and the final LSL amount is locked. ",
            B("Reject"),
            " with a reason bounces it back to the submitter.",
          ],
          [
            "Editing the claim after approval re-opens it and clears the approval, the same 'any-edit-clears-sign-off' pattern used on the EHS register.",
          ],
        ],
      },
      {
        id: "export",
        title: "4. Finance export",
        paragraphs: [
          [
            "Finance users can pull all ",
            B("approved"),
            " claims from ",
            L("/reports", "Reports"),
            " → 'Personal vehicle reimbursement claims (finance)'. The CSV includes the submitter, manager approver, distance, rate, LSL total, attachments count, and trip details, filtered by the date range set at the top of Reports.",
          ],
        ],
      },
      {
        id: "troubleshooting",
        title: "Troubleshooting",
        bullets: [
          "Submit button stays disabled → at least one attachment is missing, or eligibility is blocked. Re-check the Attachments and Eligibility panels.",
          "Rate looks wrong → open Admin → PVR rates (finance / superadmin only) and confirm the per-km rate for your org.",
          "Claim did not appear in Reports CSV → it is still in submitted state. Only approved claims export; ask the manager to approve first.",
          "Manager can't find the claim → check they are in the same organisation (country dropdown at the bottom of the sidebar).",
        ],
      },
    ],
  },

  countryTransfers: {
    title: "Country / organisation transfers",
    subtitle:
      "Fix a miscoded country on a vehicle, record a temporary secondment, or register a permanent cross-border move — with the right approvals.",
    sections: [
      {
        id: "purpose",
        title: "Purpose",
        paragraphs: [
          [
            "Every vehicle is registered against a country (via the ",
            B("organisation"),
            " — Lesotho, Zambia, or Benin). The ",
            L("/vehicle-country-changes", "Country transfers"),
            " queue lets fleet operations correct that assignment when it is wrong, and record secondments or permanent cross-border moves with evidence.",
          ],
        ],
      },
      {
        id: "three-types",
        title: "The three change types",
        bullets: [
          "Data correction — the vehicle was miscoded (typo, wrong org at seed time). Evidence: a short note. Approver: fleet lead / manager / admin.",
          "Secondment — the vehicle is temporarily operating in another country (project, short-term deployment). Evidence: mission record + passed mechanical inspection. Approver: an executive role (CEO / CFO / COO / superadmin).",
          "Permanent transfer — the vehicle is permanently re-assigned to another organisation. Same evidence as a secondment plus a clear return date of 'never'. Approver: executive.",
        ],
      },
      {
        id: "submit",
        title: "Submitting a change",
        paragraphs: [
          [
            "Submissions start from the vehicle detail page, not from the approvals queue. Open any ",
            L("/vehicles", "vehicle"),
            " → ",
            B("Country / organisation"),
            " card → ",
            B("Request change"),
            ".",
          ],
        ],
        bullets: [
          "Choose the change type: data correction / secondment / permanent transfer.",
          "Pick the destination organisation.",
          "Write a short explanation. For secondments and permanent transfers, link the mission and the latest passed Mechanical (cross-border transfer) inspection.",
          "Submit — the request appears in the Country transfers queue for the right approver role.",
        ],
      },
      {
        id: "approve",
        title: "Approving a request",
        paragraphs: [
          [
            "On the ",
            L("/vehicle-country-changes", "Country transfers"),
            " page, eligible approvers see an ",
            B("Approve"),
            " button next to each request. Data corrections are approved by fleet lead / manager / admin. Secondments and permanent transfers require an executive sign-off and will show an explanatory banner if you lack the role.",
          ],
          [
            B("Reject"),
            " with a reason bounces the request back to the submitter without changing the vehicle record.",
          ],
        ],
        callout: {
          variant: "warning",
          paragraphs: [
            [
              "Approving immediately changes the vehicle's ",
              B("organization_id"),
              " — dashboards, trip history, and the country-specific sidebar organisation filter all re-scope that vehicle. Expect it to disappear from the previous country's lists after approval.",
            ],
          ],
        },
      },
      {
        id: "inspections-required",
        title: "Mechanical inspection for transfers",
        paragraphs: [
          [
            "For secondments and permanent transfers, approvers look for a recent ",
            B("Mechanical (cross-border transfer)"),
            " inspection (under ",
            L("/inspections", "Inspections"),
            ") with an overall pass. Detailed mechanical also counts if cross-border transfer is unavailable in your org's templates.",
          ],
        ],
      },
      {
        id: "history",
        title: "Recent history",
        paragraphs: [
          [
            "The bottom of the Country transfers page shows recently decided requests (approved + rejected). Use it as an audit trail or to confirm a change took effect before a vehicle check or trip checkout.",
          ],
        ],
      },
      {
        id: "troubleshooting",
        title: "Troubleshooting",
        bullets: [
          "Can't see Country transfers in the sidebar → the link is visible to signed-in users; if you land on a 'sign in required' card, refresh your session.",
          "'Approve' disabled with a banner → your role does not match the change type. Ask the right approver (fleet lead for corrections; executive for transfers).",
          "Vehicle still shows the old country after approval → hard-refresh the page or switch the organisation dropdown in the sidebar; cached queries in other tabs can linger until reload.",
          "No Mechanical (cross-border transfer) inspection available → the templates were not seeded for this org; file a Detailed mechanical inspection instead and reference it in the note.",
        ],
      },
    ],
  },
};
