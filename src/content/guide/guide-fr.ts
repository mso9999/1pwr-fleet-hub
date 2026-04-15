import type { GuideContent } from "./types";

const L = (href: string, label: string) => ({ type: "link" as const, href, label });
const B = (text: string) => ({ type: "strong" as const, text });

export const guideFr: GuideContent = {
  index: {
    title: "Guide utilisateur",
    intro:
      "Aide intégrée à 1PWR Fleet Hub. Ouvrez un sujet ci-dessous ; chaque page correspond à l’écran. Utilisez le sélecteur EN / FR dans l’en-tête pour changer de langue.",
    tutorialTitle: "Tutoriel interactif",
    tutorialBody: [
      [
        "Parcourez les flux principaux avec des surbrillances à l’écran : tableau de bord, véhicules, trajets (y compris les manifests de chargement depuis la gestion d’actifs), contrôles, ordres de travail, carte, analyses, rapports et point quotidien. Un véhicule de démonstration (code commençant par ",
        B("TUT-"),
        ") est créé pour la visite guidée et supprimé à la fin ou à la sortie.",
      ],
      [
        "Des parcours ciblés couvrent les contrôles conducteur, les inspections mécaniques, les demandes de véhicules (distance et carburant indicatifs), les ordres de travail et ",
        B("les manifests de chargement (AM)"),
        " — liaison des listes de colisage aux trajets.",
      ],
    ],
    tutorialButton: "Mode tutoriel",
    tutorialOr: "Ou ouvrez l’application avec",
    tutorialQuery: "?tutorial=1",
    sections: [
      {
        href: "/guide/getting-started",
        title: "Premiers pas",
        description: "Connexion, organisation, langue et vue d’ensemble des zones de Fleet Hub.",
      },
      {
        href: "/guide/daily-workflows",
        title: "Flux quotidiens courants",
        description:
          "Trajets (y compris manifests AM), contrôles véhicule, signalements, ordres de travail, demandes véhicules (distance et carburant indicatifs), point quotidien et rapports.",
      },
      {
        href: "/guide/fleet-and-map",
        title: "Tableau de bord, carte et véhicules",
        description: "Indicateurs, carte en direct, parc et fiche véhicule.",
      },
      {
        href: "/guide/vehicle-checks",
        title: "Contrôles conducteur",
        description: "Checklist avant départ, équipement, défauts et validation hiérarchique des exceptions.",
      },
      {
        href: "/guide/inspections",
        title: "Inspections véhicule",
        description: "Inspections structurées : types, Pass / Alerte / Échec, photos, schéma carrosserie et ordres de travail.",
      },
      {
        href: "/guide/maintenance-and-work",
        title: "Ordres de travail, maintenance et mécaniciens",
        description: "Cycle de vie des OT, maintenance planifiée, activité mécaniciens et triage.",
      },
      {
        href: "/guide/insights-and-field",
        title: "TCO, rapports, point quotidien et terrain",
        description: "Exports analytiques, rapports terrain, triage, référence admin et GPS des sites / départ trajet.",
      },
    ],
    tipTitle: "Astuce",
    tipParagraphs: [
      [
        "Ajoutez cette page aux favoris sur téléphone ou tablette. Inspections et contrôles utilisent de grands boutons tactiles (",
        B("Pass"),
        ", ",
        B("Alerte"),
        ", ",
        B("Échec"),
        ") lorsque c’est possible.",
      ],
      ["URL de production : ", B("fm.1pwrafrica.com")],
    ],
    productionUrl: "fm.1pwrafrica.com",
  },

  gettingStarted: {
    title: "Premiers pas",
    subtitle: "Ce dont vous avez besoin pour utiliser Fleet Hub au quotidien.",
    sections: [
      {
        id: "sign-in",
        title: "Connexion",
        paragraphs: [
          [
            "Ouvrez Fleet Hub dans le navigateur (par ex. ",
            B("fm.1pwrafrica.com"),
            "). Utilisez votre e-mail et mot de passe 1PWR. Sur l’écran de connexion, choisissez ",
            B("Gestion du parc"),
            " pour rester dans cette application (ou le système PR si votre process l’exige).",
          ],
          [
            "Votre profil et vos droits sont alignés avec les autres outils 1PWR. En cas d’échec, vérifiez votre compte auprès de l’IT et le domaine autorisé.",
          ],
        ],
      },
      {
        id: "language",
        title: "Anglais / français",
        paragraphs: [
          [
            "Utilisez le sélecteur ",
            B("EN / FR"),
            " dans la barre supérieure (à côté du mode tutoriel). Le guide utilisateur suit la même langue.",
          ],
        ],
      },
      {
        id: "organization",
        title: "Organisation",
        paragraphs: [
          [
            "Si un menu d’organisation apparaît en bas de la barre latérale, choisissez l’entité (ex. Lesotho, Zambie). ",
            B("Tableau de bord"),
            ", véhicules, trajets, inspections et rapports sont filtrés sur cette organisation.",
          ],
        ],
      },
      {
        id: "sidebar",
        title: "Zones principales (menu)",
        bullets: [
          "Tableau de bord — vue d’ensemble, indicateurs, trajets actifs, OT ouverts, activité récente.",
          "Carte du parc — positions en direct ou dernières connues si la géolocalisation est active.",
          "Véhicules — parc ; ouvrir une fiche pour détails, historique et GPS.",
          "Trajets — enregistrement départ / retour avec odomètre et itinéraire.",
          "Contrôles véhicule — checklist conducteur avant déploiement ; les défauts peuvent exiger validation.",
          "Ordres de travail — maintenance (souvent liés aux inspections).",
          "Maintenance — entretien planifié et échéances.",
          "Mécaniciens — activité et affectations.",
          "Triage — priorisation (selon le process équipe).",
          "Demandes — demandes de véhicules et affectation depuis le pool.",
          "Point quotidien — texte généré pour WhatsApp ou e-mail.",
          "TCO et analyses — coûts et performance.",
          "Rapports — exports CSV.",
          "Inspections — grilles structurées (distinctes des contrôles rapides).",
          "Guide utilisateur — cette documentation.",
          "Signaler un problème — signalement terrain rapide.",
          "Administration — données de référence, approbateurs de contrôles, et tarifs d’indemnité véhicule perso (finance / superadmin).",
        ],
      },
      {
        id: "tutorial",
        title: "Mode tutoriel",
        paragraphs: [
          [
            "Depuis l’en-tête, ",
            B("Mode tutoriel"),
            " guide l’interface avec des surbrillances. Utilisez ",
            L("/?tutorial=1", "Tableau de bord avec tutoriel"),
            " pour démarrer directement.",
          ],
        ],
      },
    ],
  },

  dailyWorkflows: {
    title: "Flux quotidiens courants",
    subtitle: "Guides courts pour les tâches courantes.",
    sections: [
      {
        id: "trips",
        title: "Trajets",
        paragraphs: [
          [
            "Allez dans ",
            L("/trips", "Trajets"),
            " pour un départ : odomètre de début, destination, type de mission, chargement. Au retour, finalisez l’",
            B("arrivée"),
            " avec odomètre de fin et anomalies pour garder distances et statuts à jour.",
          ],
          [
            "Manifests de chargement (AM) : les listes de colisage sont préparées dans ",
            B("Asset Management"),
            " (am.1pwrafrica.com). Pour chaque trajet, la section ",
            B("Load-out manifests (AM)"),
            " liste les manifests liés et propose ",
            B("Open in AM"),
            " pour la vue complète. Pour associer un manifest, collez son identifiant document depuis Asset Management (libellé de trajet facultatif). ",
            B("Link"),
            " et ",
            B("Unlink"),
            " nécessitent un profil Manager ; le détail des lignes reste dans Asset Management.",
          ],
        ],
      },
      {
        id: "vehicle-checks",
        title: "Contrôles véhicule (conducteur)",
        paragraphs: [
          [
            "Ouvrez ",
            L("/vehicle-checks", "Contrôles véhicule"),
            " avant déploiement. Choisissez ",
            B("Départ du siège"),
            " ou ",
            B("Retour au siège"),
            ", puis validez chaque ligne et l’équipement (cric, triangles, roue de secours, etc.).",
          ],
          [
            "En cas d’échec, décrivez le problème. Plusieurs défauts peuvent nécessiter une ",
            B("validation hiérarchique"),
            " — voir le guide des contrôles véhicule.",
          ],
        ],
      },
      {
        id: "report-issue",
        title: "Signaler un problème terrain",
        paragraphs: [
          [
            L("/report-issue", "Signaler un problème"),
            " sert aux incidents urgents ou notables (panne, dégât, sécurité). Complète les inspections et peut alimenter les OT selon le process.",
          ],
        ],
      },
      {
        id: "work-orders",
        title: "Ordres de travail",
        paragraphs: [
          [
            L("/work-orders", "Ordres de travail"),
            " liste les interventions par statut. Les lignes en ",
            B("échec"),
            " sur une ",
            B("nouvelle"),
            " inspection peuvent créer automatiquement un OT prioritaire.",
          ],
        ],
      },
      {
        id: "maintenance",
        title: "Maintenance",
        paragraphs: [
          [
            L("/maintenance", "Maintenance"),
            " présente l’entretien planifié et les retards pour ne rien oublier entre les trajets.",
          ],
        ],
      },
      {
        id: "requests",
        title: "Demandes de véhicules",
        paragraphs: [
          [
            L("/vehicle-requests", "Demandes"),
            " permet de demander un véhicule du pool ; les managers valident et assignent un véhicule opérationnel.",
          ],
          [
            "Lorsque vous choisissez une ",
            B("destination"),
            " dans la liste des sites, Fleet Hub estime la ",
            B("distance routière aller simple"),
            " (itinéraire routier public). Une destination saisie en texte libre (« Autre ») ne donne pas de distance cartographiée.",
          ],
          [
            "Après ",
            B("affectation d’un véhicule"),
            ", la fiche de demande affiche un ",
            B("volume de carburant estimé"),
            " et le rendement (L/100 km et MPG US) à partir de la consommation du véhicule : valeur manuelle sur la fiche si renseignée, sinon valeur typique issue du tableau de référence intégré (marque, modèle, année).",
          ],
        ],
      },
      {
        id: "pvr",
        title: "Indemnité véhicule personnel",
        paragraphs: [
          [
            L("/personal-vehicle-reimbursement", "Indemnité véhicule perso"),
            " correspond au remboursement type F006 lorsqu’aucun véhicule de la flotte n’est disponible : assurance et preuve de km, validation manager, export CSV pour la finance (Rapports).",
          ],
        ],
      },
      {
        id: "daily-update",
        title: "Point quotidien",
        paragraphs: [
          [
            L("/daily-update", "Point quotidien"),
            " génère un texte à partir des données du parc — à copier dans WhatsApp ou l’e-mail pour les comités rendus.",
          ],
        ],
      },
      {
        id: "triage",
        title: "Triage",
        paragraphs: [
          [
            L("/triage", "Triage"),
            " aide le siège à prioriser charge et véhicules signalés — selon votre organisation.",
          ],
        ],
      },
      {
        id: "reports",
        title: "Rapports et exports",
        paragraphs: [
          [
            "Sous ",
            L("/reports", "Rapports"),
            ", téléchargez des CSV. L’export inspections inclut le détail des grilles — utilisez les filtres de dates.",
          ],
        ],
      },
      {
        id: "inspections-link",
        title: "Inspections (détail)",
        paragraphs: [
          [
            "Pour la procédure complète des grilles d’inspection, voir ",
            L("/guide/inspections", "Inspections véhicule"),
            ".",
          ],
        ],
      },
    ],
  },

  vehicleChecks: {
    title: "Contrôles conducteur",
    subtitle: "Checklist avant départ et validation des exceptions.",
    sections: [
      {
        id: "purpose",
        title: "Objectif",
        paragraphs: [
          [
            "Les contrôles sécurisent le déploiement avant départ (ou au retour au siège). Ils couvrent l’électricité, les fluides, la tenue de route, l’aspect visuel et l’équipement obligatoire.",
          ],
        ],
      },
      {
        id: "flow",
        title: "Comment remplir un contrôle",
        bullets: [
          "Contrôles véhicule → + Nouveau contrôle.",
          "Choisir Départ du siège ou Retour au siège.",
          "Sélectionner le véhicule, nom du conducteur, kilométrage (facultatif), itinéraire départ / arrivée.",
          "Pour chaque ligne d’état : ✓ (OK) ou ✗ (échec). Si échec, décrire dans le champ.",
          "Pour l’équipement : Oui ou Non.",
          "Ajouter des remarques puis Envoyer.",
        ],
      },
      {
        id: "exceptions",
        title: "Défauts et validation hiérarchique",
        paragraphs: [
          [
            "Si vous échouez sur une ou plusieurs lignes, l’application indique qu’une ",
            B("validation du management"),
            " peut être requise avant départ. L’organisation peut désigner des approbateurs (annuaire RH) dans l’admin ; les rôles responsable flotte, manager et admin peuvent aussi valider dans l’app.",
          ],
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              "L’envoi avec défauts enregistre le contrôle. Un manager autorisé peut appuyer sur ",
              B("Approuver les exceptions"),
              " sur la carte lorsque des exceptions sont en attente.",
            ],
          ],
        },
      },
      {
        id: "equipment",
        title: "Équipement",
        paragraphs: [
          [
            "L’équipement manquant est journalisé (ex. triangle, cric). Appliquez la politique locale sur la possibilité de partir ou non.",
          ],
        ],
      },
    ],
  },

  fleetAndMap: {
    title: "Tableau de bord, carte et véhicules",
    subtitle: "Lire l’état du parc et approfondir chaque actif.",
    sections: [
      {
        id: "dashboard",
        title: "Tableau de bord",
        paragraphs: [
          [
            "Le ",
            L("/", "Tableau de bord"),
            " affiche les indicateurs (disponibilité, MTTR, MTBF, OT ouverts, trajets actifs), la répartition par statut, les alertes, les trajets et OT en cours, l’activité récente et une grille des véhicules.",
          ],
        ],
      },
      {
        id: "map",
        title: "Carte du parc",
        paragraphs: [
          [
            L("/map", "Carte du parc"),
            " montre les positions lorsque le GPS est disponible, pour la coordination.",
          ],
        ],
      },
      {
        id: "vehicles",
        title: "Véhicules",
        paragraphs: [
          [
            L("/vehicles", "Véhicules"),
            " liste le parc pour l’organisation sélectionnée. Ouvrez une fiche pour statut, trajets, inspections, OT et suivi.",
          ],
        ],
      },
      {
        id: "trips-link",
        title: "Trajets",
        paragraphs: [
          [
            "Utilisez ",
            L("/trips", "Trajets"),
            " pour journaliser les missions. Un contrôle véhicule est souvent requis avant le premier départ — voir le guide des contrôles.",
          ],
          [
            "Liez les listes de chargement depuis Asset Management dans la section ",
            B("Load-out manifests (AM)"),
            " de chaque trajet (voir ",
            L("/guide/daily-workflows", "Flux quotidiens courants"),
            ").",
          ],
        ],
      },
    ],
  },

  maintenanceAndWork: {
    title: "Ordres de travail, maintenance et mécaniciens",
    subtitle: "Suivi de la maintenance et visibilité des interventions.",
    sections: [
      {
        id: "work-orders",
        title: "Ordres de travail",
        paragraphs: [
          [
            L("/work-orders", "Ordres de travail"),
            " suivent les interventions des signalements ou inspections jusqu’à clôture. Statut et priorité indiquent l’urgence.",
          ],
        ],
      },
      {
        id: "maintenance",
        title: "Maintenance planifiée",
        paragraphs: [
          [
            L("/maintenance", "Maintenance"),
            " liste l’entretien programmé et les retards.",
          ],
        ],
      },
      {
        id: "mechanics",
        title: "Mécaniciens",
        paragraphs: [
          [
            L("/mechanics", "Mécaniciens"),
            " présente l’activité et la charge des mécaniciens.",
          ],
        ],
      },
      {
        id: "triage",
        title: "Triage",
        paragraphs: [
          [
            L("/triage", "Triage"),
            " aide à trier et prioriser les problèmes sur le parc.",
          ],
        ],
      },
      {
        id: "inspections-wo",
        title: "Inspections → ordres de travail",
        paragraphs: [
          [
            "Lors de l’envoi d’une ",
            B("nouvelle"),
            " inspection avec des lignes en ",
            B("échec"),
            ", le système peut créer un OT prioritaire récapitulant les défauts. ",
            B("Alerte"),
            " seule ne crée pas d’OT automatique.",
          ],
        ],
        callout: {
          variant: "warning",
          paragraphs: [
            [
              "Modifier une inspection ancienne ne crée pas de nouveaux OT — seule la soumission initiale déclenche l’automatisation.",
            ],
          ],
        },
      },
    ],
  },

  insightsAndField: {
    title: "TCO, rapports, terrain et admin",
    subtitle: "Analyses, exports, communication et paramètres.",
    sections: [
      {
        id: "tco",
        title: "TCO et analyses",
        paragraphs: [
          [
            L("/tco", "TCO et analyses"),
            " propose des vues coûts et performance pour les décisions.",
          ],
        ],
      },
      {
        id: "reports",
        title: "Rapports",
        paragraphs: [
          [
            L("/reports", "Rapports"),
            " permet des exports CSV pour tableurs et audits. Filtrez par type et période.",
          ],
        ],
      },
      {
        id: "daily-update",
        title: "Point quotidien",
        paragraphs: [
          [
            L("/daily-update", "Point quotidien"),
            " construit un résumé narratif à partir des données en direct.",
          ],
        ],
      },
      {
        id: "report-issue",
        title: "Signaler un problème",
        paragraphs: [
          [
            L("/report-issue", "Signaler un problème"),
            " capture rapidement un incident lorsqu’une inspection complète n’est pas possible.",
          ],
        ],
      },
      {
        id: "admin",
        title: "Administration (référence et approbateurs)",
        paragraphs: [
          [
            L("/admin", "Administration"),
            " est réservé aux profils autorisés : données de référence (sites, départements, types de mission, ateliers tiers) et synchronisation Firestore PR le cas échéant.",
          ],
          [
            "Les administrateurs peuvent aussi définir ",
            B("qui peut approuver les exceptions de contrôle véhicule"),
            " en chargeant l’annuaire RH et en sélectionnant des personnes (correspondance par e-mail).",
          ],
          [
            "Les rôles ",
            B("finance"),
            " ou ",
            B("superadmin"),
            " peuvent fixer les ",
            B("tarifs financiers d’indemnité véhicule personnel"),
            " (LSL/km et base km pour le forfait aller-retour) ; sinon les valeurs par défaut du tableur F006 s’appliquent.",
          ],
          [
            "Pour des ",
            B("distances cohérentes"),
            " sur les demandes, les administrateurs renseignent le ",
            B("GPS"),
            " de chaque ",
            B("site / destination"),
            " (Sites dans Admin) : ",
            B("Définir le GPS"),
            " avec la carte ou saisie latitude / longitude. Les profils autorisés peuvent aussi définir le ",
            B("point de départ du trajet (siège / flotte)"),
            " ; sinon des valeurs par défaut s’appliquent.",
          ],
        ],
      },
    ],
  },

  inspections: {
    title: "Inspections véhicule (grilles)",
    subtitle: "Procédure alignée sur l’écran Inspections.",
    sections: [
      {
        id: "before-you-start",
        title: "Avant de commencer",
        bullets: [
          "Connectez-vous avec votre e-mail 1PWR. Si l’application charge indéfiniment, vérifiez le réseau ou le compte auprès de l’IT.",
          "Si plusieurs organisations : choisissez en bas de barre latérale ; les listes suivent ce choix.",
          "Le menu véhicule ne liste que les unités synchronisées. Si un camion manque, l’admin flotte doit synchroniser ou créer la fiche.",
        ],
      },
      {
        id: "open-inspections",
        title: "1. Ouvrir Inspections",
        paragraphs: [
          [
            "Dans le menu, ouvrez ",
            L("/inspections", "Inspections"),
            ". Vous voyez les grilles enregistrées et le bouton ",
            B("+ Nouvelle inspection"),
            " en haut.",
          ],
        ],
      },
      {
        id: "start-new",
        title: "2. Nouvelle grille",
        paragraphs: [
          [
            "Appuyez sur ",
            B("+ Nouvelle inspection"),
            ". Le formulaire s’ouvre sur la même page ; rien n’est enregistré tant que vous n’avez pas envoyé.",
          ],
        ],
      },
      {
        id: "choose-type",
        title: "3. Type de grille",
        paragraphs: [["Utilisez les trois onglets en haut du formulaire :"]],
        bullets: [
          "Pré-départ (rapide) — liste courte orientée sécurité avant trajet.",
          "Mécanique détaillée — liste rapide + points mécaniques approfondis.",
          "Grille 1PWR (2025) — grille complète pour évaluation / conformité.",
        ],
      },
      {
        id: "switching",
        title: "Changer de type",
        paragraphs: [
          [
            "Changer de type efface les notes et notations du brouillon pour éviter de mélanger les modèles.",
          ],
        ],
      },
      {
        id: "vehicle-inspector",
        title: "4. Véhicule et inspecteur",
        bullets: [
          "Véhicule * — obligatoire. Le dossier est lié à ce code pour l’historique et les OT.",
          "Nom de l’inspecteur * — obligatoire, tel qu’il doit apparaître sur la trace.",
        ],
      },
      {
        id: "rate-lines",
        title: "5. Chaque ligne (Pass / Alerte / Échec)",
        paragraphs: [["Chaque ligne correspond à un point de contrôle, groupé par rubrique."]],
        bullets: [
          "Pass (✓) — conforme. État par défaut.",
          "Alerte (!) — à surveiller rapidement, pas une défaillance immédiate. Notez si utile.",
          "Échec (✗) — non conforme ou dangereux. Vous devez ajouter une note de ligne, au moins une photo, ou une annotation sur le schéma avant envoi.",
        ],
      },
      {
        id: "body-plan",
        title: "Schéma carrosserie (vue dessus)",
        paragraphs: [
          [
            "Sur les lignes carrosserie, un schéma peut apparaître. Touchez pour placer des ",
            B("X"),
            " et décrire chaque marque. Les inspections enregistrées affichent le schéma dans la carte détaillée.",
          ],
        ],
      },
      {
        id: "auto-wo",
        title: "Ordre de travail automatique",
        callout: {
          variant: "warning",
          paragraphs: [
            [
              "À l’",
              B("envoi d’une nouvelle"),
              " inspection, toute ligne en ",
              B("échec"),
              " crée un OT ",
              B("haute priorité"),
              " pour ce véhicule. ",
              B("Alerte"),
              " seule ne crée pas d’OT. Modifier une ancienne inspection ne crée pas d’OT.",
            ],
          ],
        },
      },
      {
        id: "submit",
        title: "6. Envoi",
        bullets: [
          "Envoyer l’inspection quand c’est terminé ; attendez la fin du traitement puis la grille apparaît dans la liste.",
          "Annuler ferme sans enregistrer.",
          "Résultat global : réussi s’il n’y a pas d’échec ; un seul échec rend l’inspection globalement en échec.",
        ],
      },
      {
        id: "after-saved",
        title: "7. Après enregistrement",
        bullets: [
          "Développer une carte — voir toutes les lignes et notes.",
          "Modifier — mettre à jour véhicule, inspecteur ou lignes.",
          "Supprimer — définitif après confirmation.",
          "Exporter — via Rapports en CSV.",
        ],
      },
    ],
  },
};
