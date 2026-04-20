export type Locale = "en" | "fr";

const en = {
  brand: {
    title: "1PWR Fleet Hub",
    subtitle: "Vehicle Management",
  },
  nav: {
    dashboard: "Dashboard",
    fleetMap: "Fleet Map",
    vehicles: "Vehicles",
    trips: "Trips",
    vehicleChecks: "Vehicle Checks",
    workOrders: "Work Orders",
    maintenance: "Maintenance",
    mechanics: "Mechanics",
    triage: "Triage",
    requests: "Requests",
    countryTransfers: "Country transfers",
    personalVehicleReimbursement: "Personal vehicle claim",
    dailyUpdate: "Daily Update",
    tcoAnalytics: "TCO & Analytics",
    reports: "Reports",
    inspections: "Inspections",
    userGuide: "User guide",
    reportIssue: "Report Issue",
    admin: "Admin",
    ehsApprovedDrivers: "Approved drivers (EHS)",
  },
  header: {
    ehsApprovedDrivers: "Approved drivers (EHS)",
    guide: "User guide",
    guideInspections: "User guide · Inspections",
    guideGettingStarted: "User guide · Getting started",
    guideDailyWorkflows: "User guide · Daily workflows",
    guideVehicleChecks: "User guide · Vehicle checks",
    guideFleetAndMap: "User guide · Dashboard & map",
    guideMaintenanceAndWork: "User guide · Maintenance & work orders",
    guideInsightsAndField: "User guide · Analytics & field",
  },
  guide: {
    backToIndex: "← User guide",
    allTopics: "All guide topics",
    onThisPage: "On this page",
    goToInspections: "Go to Inspections",
    goToApprovedDrivers: "Go to Approved drivers (EHS)",
  },
  auth: {
    signedInAs: "Signed in as",
    signOut: "Sign out",
  },
  common: {
    loading: "Loading...",
    loadingDashboard: "Loading dashboard…",
    failedDashboard: "Failed to load dashboard",
    loadingEllipsis: "Loading…",
  },
  dashboard: {
    fleetOverview: "Fleet Overview",
    subtitle: "Real-time fleet status, KPIs, and alerts",
    fleetUptime: "Fleet Uptime",
    mttr: "MTTR",
    mtbf: "MTBF",
    openWOs: "Open WOs",
    activeTrips: "Active Trips",
    total: "Total",
    operational: "Operational",
    deployed: "Deployed",
    maintHq: "Maint. HQ",
    maint3rd: "Maint. 3rd",
    awaitingParts: "Awaiting Parts",
    grounded: "Grounded",
    alerts: "Alerts",
    activeTripsTitle: "Active Trips",
    viewAll: "View all",
    noActiveTrips: "No active trips",
    returnLabel: "Return",
    openWorkOrdersTitle: "Open Work Orders",
    noOpenWorkOrders: "No open work orders",
    recentActivity: "Recent Activity (7 days)",
    allVehicles: "All Vehicles",
    manage: "Manage",
    daysShort: "d",
    daysUnit: "days",
    high: "High",
    hints: {
      fleetUptime:
        "Share of vehicles (excluding written-off) that are operational or deployed — a snapshot of how much of the fleet is available or out on mission.",
      mttr:
        "Mean Time To Repair — average days from downtime start to downtime end on work orders where both dates are recorded (completed repairs).",
      mtbf:
        "Mean Time Between Failures — average days between consecutive work orders on the same vehicle (rough spacing between repair events).",
      openWOs:
        "Work orders that are still open: anything not in completed, validated, closed, or cancelled status.",
      activeTrips: "Trips that are checked out and not yet checked in (vehicle still on mission).",
      maintHq: "Count of vehicles currently in maintenance at headquarters (in-house workshop).",
      maint3rd: "Count of vehicles in maintenance at an external / third-party workshop.",
    },
  },
  login: {
    signInContinue: "Sign in to continue",
    fleetManagement: "Fleet Management",
    prSystem: "PR System",
    email: "Email",
    password: "Password",
    emailPlaceholder: "name@1pwr.com",
    signingIn: "Signing in...",
    openFleetHub: "Open Fleet Hub",
    openPRSystem: "Open PR System",
    sameCredentials: "Same credentials for both systems",
  },
  tutorial: {
    mode: "Tutorials",
    chooseTrack: "Choose a tutorial…",
  },
  language: {
    en: "EN",
    fr: "FR",
    label: "Language",
  },
  status: {
    vehicle: {
      operational: "Operational",
      deployed: "Deployed",
      "maintenance-hq": "Maint. HQ",
      "maintenance-3rdparty": "Maint. 3rd Party",
      "awaiting-parts": "Awaiting Parts",
      grounded: "Grounded",
      "written-off": "Written Off",
    },
    workOrder: {
      submitted: "Submitted",
      queued: "Queued",
      "in-progress": "In Progress",
      "awaiting-parts": "Awaiting Parts",
      completed: "Completed",
      closed: "Closed",
      "return-repair": "Return & Repair",
      cancelled: "Cancelled",
      rejected: "Rejected",
    },
    priority: {
      critical: "Critical",
      high: "High",
      medium: "Medium",
      low: "Low",
    },
  },
  ehsOperator: {
    groups: {
      driving: "Driving",
      plant: "Plant and heavy equipment",
      machining: "Machine shop",
    },
    grants: {
      none: "None",
      approved: "Approved",
      trainer: "Trainer",
    },
    assessments: {
      pass: "Pass",
      fail: "Fail",
      pending: "Pending",
    },
    attestation: {
      checkboxLabel:
        "I confirm the assessments, licence, and authorizations above are accurate.",
      lastAttestedBy: "Attested by",
      staleBanner: "This record has changed since it was last signed off — re-tick and save to re-attest.",
      neverAttested: "Not yet attested.",
      attestButton: "Attest and save",
    },
    categories: {
      fleet_vehicle_onroad: {
        label: "Insured 1PWR vehicle on public roads",
        description: "Licence on file, valid for more than two years (2-year continuity rule).",
      },
      fleet_vehicle_onroad_heavy: {
        label: "Insured 1PWR heavy vehicle on public roads",
        description: "Licence on file plus heavy-vehicle training record.",
      },
      motorcycle_onroad: {
        label: "Motorcycle on public roads",
        description: "Motorcycle licence on file.",
      },
      ldf_defensive: {
        label: "LDF Defensive driving",
        description: "LDF defensive driving certificate on file.",
      },
      offroad_vehicle: {
        label: "Off-road vehicle (ATV / motorcycle)",
        description: "Training record on file; off-road written test passed.",
      },
      telehandler: {
        label: "Telehandler / Forklift / TLB",
        description: "Operator training record on file; off-road written test passed.",
      },
      excavator: {
        label: "Excavator",
        description: "Operator training record on file; off-road written test passed.",
      },
      drill_rig: {
        label: "Drill rig",
        description: "Operator training record on file; off-road written test passed.",
      },
      tractor: {
        label: "Tractor",
        description: "Tractor training record on file.",
      },
      crane: {
        label: "Crane",
        description: "Operator training record on file; off-road written test passed.",
      },
      cnc_milling: {
        label: "CNC milling",
        description: "Training record on file.",
      },
      manual_milling: {
        label: "Manual milling / turning",
        description: "Training record on file.",
      },
      cnc_plasma_cutting: {
        label: "CNC plasma cutting",
        description: "Training record on file.",
      },
      mig_welder: {
        label: "MIG welder",
        description: "Training record on file.",
      },
      tig_welder: {
        label: "TIG welder",
        description: "Training record on file.",
      },
      machine_shop_general: {
        label: "Machine shop general",
        description: "Training record on file.",
      },
    },
  },
};

type MessageTree = typeof en;

const fr: MessageTree = {
  brand: {
    title: "1PWR Fleet Hub",
    subtitle: "Gestion du parc",
  },
  nav: {
    dashboard: "Tableau de bord",
    fleetMap: "Carte du parc",
    vehicles: "Véhicules",
    trips: "Trajets",
    vehicleChecks: "Contrôles véhicule",
    workOrders: "Ordres de travail",
    maintenance: "Maintenance",
    mechanics: "Mécaniciens",
    triage: "Triage",
    requests: "Demandes",
    countryTransfers: "Transferts pays",
    personalVehicleReimbursement: "Indemnité véhicule perso",
    dailyUpdate: "Point quotidien",
    tcoAnalytics: "TCO et analyses",
    reports: "Rapports",
    inspections: "Inspections",
    userGuide: "Guide utilisateur",
    reportIssue: "Signaler un problème",
    admin: "Administration",
    ehsApprovedDrivers: "Conducteurs agréés (EHS)",
  },
  header: {
    ehsApprovedDrivers: "Conducteurs agréés (EHS)",
    guide: "Guide utilisateur",
    guideInspections: "Guide utilisateur · Inspections",
    guideGettingStarted: "Guide utilisateur · Premiers pas",
    guideDailyWorkflows: "Guide utilisateur · Flux quotidiens",
    guideVehicleChecks: "Guide utilisateur · Contrôles véhicule",
    guideFleetAndMap: "Guide utilisateur · Tableau de bord et carte",
    guideMaintenanceAndWork: "Guide utilisateur · Maintenance et OT",
    guideInsightsAndField: "Guide utilisateur · Analyses et terrain",
  },
  guide: {
    backToIndex: "← Guide utilisateur",
    allTopics: "Tous les sujets",
    onThisPage: "Sur cette page",
    goToInspections: "Ouvrir Inspections",
    goToApprovedDrivers: "Ouvrir Conducteurs agréés (EHS)",
  },
  auth: {
    signedInAs: "Connecté en tant que",
    signOut: "Déconnexion",
  },
  common: {
    loading: "Chargement...",
    loadingDashboard: "Chargement du tableau de bord…",
    failedDashboard: "Échec du chargement du tableau de bord",
    loadingEllipsis: "Chargement…",
  },
  dashboard: {
    fleetOverview: "Vue d’ensemble du parc",
    subtitle: "État du parc en temps réel, indicateurs et alertes",
    fleetUptime: "Disponibilité du parc",
    mttr: "MTTR",
    mtbf: "MTBF",
    openWOs: "OT ouverts",
    activeTrips: "Trajets actifs",
    total: "Total",
    operational: "Opérationnel",
    deployed: "Déployé",
    maintHq: "Maint. siège",
    maint3rd: "Maint. tiers",
    awaitingParts: "En attente de pièces",
    grounded: "Immobilisé",
    alerts: "Alertes",
    activeTripsTitle: "Trajets actifs",
    viewAll: "Tout voir",
    noActiveTrips: "Aucun trajet actif",
    returnLabel: "Retour",
    openWorkOrdersTitle: "Ordres de travail ouverts",
    noOpenWorkOrders: "Aucun ordre de travail ouvert",
    recentActivity: "Activité récente (7 jours)",
    allVehicles: "Tous les véhicules",
    manage: "Gérer",
    daysShort: "j",
    daysUnit: "jours",
    high: "Élevée",
    hints: {
      fleetUptime:
        "Part du parc (hors véhicules radiés) en statut opérationnel ou déployé — vue d’ensemble de la disponibilité ou des unités en mission.",
      mttr:
        "Mean Time To Repair (MTTR) — durée moyenne en jours entre le début et la fin d’immobilisation pour les ordres de travail où les deux dates sont renseignées.",
      mtbf:
        "Mean Time Between Failures (MTBF) — espacement moyen en jours entre deux ordres de travail successifs sur un même véhicule.",
      openWOs:
        "Ordres de travail encore ouverts : tout statut autre que terminé, validé, clôturé ou annulé.",
      activeTrips: "Trajets démarrés (checkout) sans retour enregistré (check-in) — véhicule encore en mission.",
      maintHq: "Véhicules en maintenance au siège / atelier interne.",
      maint3rd: "Véhicules en maintenance chez un prestataire externe.",
    },
  },
  login: {
    signInContinue: "Connectez-vous pour continuer",
    fleetManagement: "Gestion du parc",
    prSystem: "Système PR",
    email: "E-mail",
    password: "Mot de passe",
    emailPlaceholder: "nom@1pwr.com",
    signingIn: "Connexion...",
    openFleetHub: "Ouvrir Fleet Hub",
    openPRSystem: "Ouvrir le système PR",
    sameCredentials: "Les mêmes identifiants pour les deux systèmes",
  },
  tutorial: {
    mode: "Tutoriels",
    chooseTrack: "Choisir un tutoriel…",
  },
  language: {
    en: "EN",
    fr: "FR",
    label: "Langue",
  },
  status: {
    vehicle: {
      operational: "Opérationnel",
      deployed: "Déployé",
      "maintenance-hq": "Maint. siège",
      "maintenance-3rdparty": "Maint. tiers",
      "awaiting-parts": "En attente de pièces",
      grounded: "Immobilisé",
      "written-off": "Radié",
    },
    workOrder: {
      submitted: "Soumis",
      queued: "En file",
      "in-progress": "En cours",
      "awaiting-parts": "En attente de pièces",
      completed: "Terminé",
      closed: "Clôturé",
      "return-repair": "Retour et réparation",
      cancelled: "Annulé",
      rejected: "Rejeté",
    },
    priority: {
      critical: "Critique",
      high: "Élevée",
      medium: "Moyenne",
      low: "Faible",
    },
  },
  ehsOperator: {
    groups: {
      driving: "Conduite",
      plant: "Engins et équipements lourds",
      machining: "Atelier d’usinage",
    },
    grants: {
      none: "Aucun",
      approved: "Agréé",
      trainer: "Formateur",
    },
    assessments: {
      pass: "Réussi",
      fail: "Échoué",
      pending: "En attente",
    },
    attestation: {
      checkboxLabel:
        "Je confirme que les évaluations, le permis et les autorisations ci-dessus sont exacts.",
      lastAttestedBy: "Attesté par",
      staleBanner:
        "Cette fiche a changé depuis la dernière validation — re-cochez et enregistrez pour re-attester.",
      neverAttested: "Pas encore attesté.",
      attestButton: "Attester et enregistrer",
    },
    categories: {
      fleet_vehicle_onroad: {
        label: "Véhicule 1PWR assuré sur route",
        description: "Permis en dossier, valide depuis plus de deux ans (règle des deux ans).",
      },
      fleet_vehicle_onroad_heavy: {
        label: "Poids lourd 1PWR assuré sur route",
        description: "Permis en dossier et attestation de formation poids lourd.",
      },
      motorcycle_onroad: {
        label: "Moto sur route",
        description: "Permis moto en dossier.",
      },
      ldf_defensive: {
        label: "Conduite défensive LDF",
        description: "Certificat de conduite défensive LDF en dossier.",
      },
      offroad_vehicle: {
        label: "Véhicule tout-terrain (ATV / moto)",
        description: "Attestation de formation en dossier ; test écrit tout-terrain réussi.",
      },
      telehandler: {
        label: "Télescopique / Chariot / TLB",
        description: "Attestation de formation opérateur ; test écrit tout-terrain réussi.",
      },
      excavator: {
        label: "Excavatrice",
        description: "Attestation de formation opérateur ; test écrit tout-terrain réussi.",
      },
      drill_rig: {
        label: "Foreuse",
        description: "Attestation de formation opérateur ; test écrit tout-terrain réussi.",
      },
      tractor: {
        label: "Tracteur",
        description: "Attestation de formation tracteur en dossier.",
      },
      crane: {
        label: "Grue",
        description: "Attestation de formation opérateur ; test écrit tout-terrain réussi.",
      },
      cnc_milling: {
        label: "Fraiseuse CNC",
        description: "Attestation de formation en dossier.",
      },
      manual_milling: {
        label: "Fraisage / tournage manuel",
        description: "Attestation de formation en dossier.",
      },
      cnc_plasma_cutting: {
        label: "Découpe plasma CNC",
        description: "Attestation de formation en dossier.",
      },
      mig_welder: {
        label: "Soudeur MIG",
        description: "Attestation de formation en dossier.",
      },
      tig_welder: {
        label: "Soudeur TIG",
        description: "Attestation de formation en dossier.",
      },
      machine_shop_general: {
        label: "Atelier d’usinage général",
        description: "Attestation de formation en dossier.",
      },
    },
  },
};

export const messages: Record<Locale, MessageTree> = { en, fr };

export type { MessageTree };
