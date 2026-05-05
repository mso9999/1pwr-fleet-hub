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
        ") est créé pour la visite guidée et supprimé à la fin ou à la sortie. Le parcours ",
        B("Déploiement terrain (de bout en bout)"),
        " crée aussi une mission sandbox approuvée et une réservation sur ce véhicule ; tout trajet démarré depuis celle-ci est supprimé lors du même nettoyage.",
      ],
      [
        "Des parcours ciblés couvrent les contrôles conducteur, les inspections mécaniques, les demandes de véhicules (missions, demande par type, distance et carburant indicatifs), les ordres de travail et ",
        B("les manifests de chargement (AM)"),
        " — liaison des listes de colisage aux trajets.",
      ],
      [
        B("Déploiement terrain (de bout en bout)"),
        " suit le chemin complet : nouvelle mission, validation management, réservation parc, calendrier des réservations, checklist conducteur au départ, checkout de trajet lié à la mission et manifests AM — avec un badge ",
        B("Rôle"),
        " à chaque étape lorsque une autre personne ou un autre niveau de droits intervient en principe.",
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
        href: "/guide/ehs-approved-drivers",
        title: "Registre EHS des opérateurs agréés (D018)",
        description:
          "Qui peut opérer les véhicules et équipements 1PWR : liste issue des RH, permis + cinq évaluations, matrice d’autorisations (16 catégories) et attestation EHS par fiche.",
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
        href: "/guide/personal-vehicle-reimbursement",
        title: "Indemnité véhicule personnel (F006)",
        description:
          "Soumettre une indemnité kilométrique quand aucun véhicule de la flotte n’est disponible : éligibilité, pièces jointes, approbation, export CSV finance.",
      },
      {
        href: "/guide/country-transfers",
        title: "Transferts de pays / organisation",
        description:
          "Corriger un pays mal codé, enregistrer un détachement ou acter un transfert transfrontalier permanent avec les bons approbateurs.",
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
          "Trajets — check-out / retour opérationnel (véhicule réel et odomètre). Missions planifiées et logistique pool : voir Demandes.",
          "Contrôles véhicule — checklist conducteur avant déploiement ; les défauts peuvent exiger validation.",
          "Conducteurs agréés (EHS) — registre D018 : permis + cinq évaluations (vision, audition, réaction, écrit, pratique), matrice d’autorisations (16 catégories) et attestation EHS. Visible par tous les utilisateurs connectés ; seuls le département EHS et les admins peuvent modifier.",
          "Ordres de travail — maintenance (souvent liés aux inspections) ; statuts needs-parts et DA soumise pour l’approvisionnement.",
          "Maintenance — entretien planifié et échéances.",
          "Mécaniciens — activité et affectations.",
          "Triage — priorisation des OT avec scoring §9 (garder siège / revoir / tiers) et indicateurs de capacité.",
          "Demandes — missions (profil, classe d’actif requise, R&R), validation direction, ligne logistique conducteur ; le lead flotte réserve un véhicule du pool sur la mission. La direction peut arbitrer la capacité le jour du départ.",
          "Transferts de pays — file d’approbation pour corrections, détachements et transferts transfrontaliers permanents.",
          "Indemnité véhicule perso — indemnité F006 quand aucun véhicule flotte n’est disponible ; le manager valide, la finance exporte le CSV.",
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
            " pour démarrer directement, ou ",
            L("/?tutorial=field-deployment", "déploiement terrain de bout en bout"),
            " pour missions → validation → réservation → contrôle conducteur → checkout trajet.",
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
            " avec odomètre de fin et anomalies pour garder distances et statuts à jour. Pour ",
            B("planifier"),
            " un déplacement et fixer la ",
            B("classe de véhicule requise sur la mission"),
            ", utilisez ",
            L("/vehicle-requests", "Demandes"),
            " (mission → validation → ligne logistique facultative → réservation flotte sur la mission) ; Trajets est l’enregistrement opérationnel une fois le véhicule concret connu.",
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
          [
            "Utilisez ",
            B("needs-parts"),
            " et ",
            B("pr-submitted"),
            " pour l’approvisionnement : pièces identifiées, puis DA liée ou en cours. Ajoutez les liens PR/PO sur la fiche OT selon votre processus.",
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
        title: "Missions et demandes véhicules",
        paragraphs: [
          [
            L("/vehicle-requests", "Demandes"),
            " sert aux trajets planifiés : créer une ",
            B("mission"),
            " (dates, profil local/champ, ",
            B("classe d’actif requise"),
            ", R&R), attendre la ",
            B("validation direction"),
            ". Les conducteurs agréés peuvent soumettre une ",
            B("demande logistique"),
            " pour créer la ligne file d’attente (objet, priorité) ; la classe vient en général de la mission. Un ",
            B("lead flotte"),
            " ",
            B("réserve"),
            " un véhicule du pool sur la mission (règles de statut selon la date, sans double réservation ; les managers peuvent lever un chevauchement). L’approbation de ligne sur la demande reste distincte de la mission lorsque ce flux est utilisé.",
          ],
          [
            L("/trips", "Trajets"),
            " est différent : c’est le ",
            B("check-out opérationnel"),
            " (véhicule réel, odomètre, retour). Utilisez Demandes pour la planification et la réservation mission ; Trajets lorsque le véhicule part réellement.",
          ],
          [
            "Seuls les conducteurs inscrits au ",
            L("/guide/ehs-approved-drivers", "registre des conducteurs agréés (EHS)"),
            " peuvent soumettre une demande (superadmin excepté). Si votre demande est bloquée pour ce motif, demandez à EHS de vous ajouter.",
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
          "Sélectionner le véhicule, choisir le conducteur dans la liste agréée, kilométrage (facultatif), itinéraire départ / arrivée.",
          "Pour chaque ligne d’état : ✓ (OK) ou ✗ (échec). Si échec, décrire dans le champ.",
          "Pour l’équipement : Oui ou Non.",
          "Ajouter des remarques puis Envoyer.",
        ],
      },
      {
        id: "driver-picker",
        title: "Sélecteur de conducteur (agréés EHS)",
        paragraphs: [
          [
            "Le champ Conducteur est une liste déroulante recherchable alimentée par le ",
            L("/guide/ehs-approved-drivers", "registre des conducteurs agréés (EHS)"),
            " pour l’organisation en cours. Seuls les conducteurs pleinement conformes (permis + quatre tests + scan de permis) apparaissent.",
          ],
          [
            "Si l’utilisateur connecté figure dans la liste, le champ est pré-rempli. Un nom saisi qui ne correspond à aucun conducteur enregistré est accepté comme ",
            B("saisie libre"),
            " et signalé en orange sous le champ — EHS devrait ajouter cette personne au registre si elle conduit régulièrement.",
          ],
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

  ehsApprovedDrivers: {
    title: "Registre EHS des opérateurs agréés (D018)",
    subtitle:
      "Comment EHS tient à jour la liste des opérateurs autorisés à utiliser les véhicules et équipements 1PWR, avec attestation par fiche et matrice d’autorisations D018.",
    sections: [
      {
        id: "purpose",
        title: "Objectif",
        paragraphs: [
          [
            "La page ",
            L("/ehs-approved-drivers", "Conducteurs agréés (EHS)"),
            " héberge dans Fleet Hub la ",
            B("D018 Approved Operator List"),
            " de 1PWR. Elle remplace le tableur : le ",
            B("département EHS"),
            " saisit cinq évaluations physiques et de proficience, charge les preuves de permis et de formation, fixe l’autorisation pour chacune des 16 catégories d’équipement, et atteste chaque fiche.",
          ],
          [
            "Fleet Hub s’en sert à deux points : le sélecteur du ",
            L("/guide/vehicle-checks", "contrôle conducteur"),
            " (filtré sur l’autorisation correspondant à la classe du véhicule choisi) et les ",
            L("/guide/daily-workflows", "demandes de véhicules"),
            " (le demandeur doit être habilité pour la conduite sur route).",
          ],
        ],
      },
      {
        id: "who",
        title: "Qui voit et qui modifie",
        bullets: [
          "Consultation : tout utilisateur connecté à Fleet Hub — le registre est en lecture seule pour tous, afin que les conducteurs vérifient leur statut et que les demandeurs voient qui est éligible.",
          "Modification : uniquement le département EHS (département PR = EHS) ou les admins. Les managers et responsables flotte voient le registre mais ne peuvent pas modifier les dates, charger des permis, ni ajouter / retirer des personnes.",
          "Le chargeur d’employés RH en haut de la page reste réservé à EHS, la direction flotte et les admins (il expose l’annuaire RH contenant des données personnelles).",
        ],
      },
      {
        id: "country-aware",
        title: "Liste par pays",
        paragraphs: [
          [
            "Le registre est par organisation (= pays : Lesotho / Zambie / Bénin). Un conducteur agréé dans un pays n’apparaît pas automatiquement dans un autre — EHS doit l’ajouter dans chaque organisation où il conduit.",
          ],
          [
            "Le chargeur RH en haut de page propose un ",
            B("filtre pays"),
            " optionnel (ex. ",
            B("LS"),
            ", ",
            B("ZM"),
            ", ",
            B("BJ"),
            ") pour restreindre la liste avant sélection.",
          ],
        ],
      },
      {
        id: "add-driver",
        title: "Ajouter un conducteur depuis les RH",
        paragraphs: [],
        bullets: [
          "Ouvrir Conducteurs agréés (EHS) dans le menu.",
          "Sous « Ajouter un conducteur depuis l’annuaire RH », saisir un filtre pays optionnel puis cliquer sur Charger les employés depuis RH.",
          "Rechercher dans la liste (nom, e-mail, matricule).",
          "Sélectionner la personne dans la liste Employé. Les personnes déjà enregistrées sont marquées « (déjà listée) ».",
          "Cliquer sur Ajouter au registre. Une nouvelle fiche apparaît avec permis et tests à compléter.",
        ],
      },
      {
        id: "licence-and-tests",
        title: "Permis et cinq évaluations",
        paragraphs: [
          [
            "Chaque fiche d’opérateur porte un bloc permis et cinq évaluations ",
            B("Réussi / Échoué / En attente"),
            ". EHS bascule chaque évaluation directement sur la fiche — toute modification efface l’attestation et repasse la fiche en Brouillon jusqu’à une nouvelle signature.",
          ],
        ],
        bullets: [
          "Permis valide depuis / Permis expire le (dates du document physique).",
          "Scan du permis — au moins un fichier en dossier.",
          "Évaluation physique : Vision, Audition, Réaction.",
          "Proficience : Écrit (tout-terrain) et Pratique.",
          "Statut — actif (peut opérer) ou suspendu (temporairement bloqué).",
          "Notes — texte libre (ex. « Véhicules automatiques uniquement »).",
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              B("Règle de continuité de deux ans : "),
              "pour les véhicules légers sur route, la date de validité du permis doit dater d’au moins deux ans et l’expiration ne doit pas être dépassée. Les autres catégories assouplissent ou lèvent cette règle (la formation poids lourd, par exemple, prime).",
            ],
          ],
        },
      },
      {
        id: "authorizations",
        title: "Matrice d’autorisations D018",
        paragraphs: [
          [
            "Sous l’accordéon ",
            B("Autorisations (D018)"),
            " de la fiche, chacune des seize catégories du tableur apparaît une fois. Pour chaque catégorie EHS choisit un niveau — ",
            B("Aucun"),
            ", ",
            B("Agréé"),
            ", ou ",
            B("Formateur"),
            " — ajoute des notes et charge une attestation de formation si requis.",
          ],
        ],
        bullets: [
          "Conduite : Véhicule 1PWR sur route, Poids lourd sur route, Moto sur route, Conduite défensive LDF.",
          "Engins / équipements lourds : Tout-terrain (ATV / moto), Télescopique / Chariot / TLB, Excavatrice, Foreuse, Tracteur, Grue.",
          "Atelier d’usinage : Fraiseuse CNC, Fraisage / tournage manuel, Découpe plasma CNC, Soudeur MIG, Soudeur TIG, Atelier général.",
          "Formateur implique Agréé — un formateur peut opérer et encadrer les autres.",
          "Une attestation de formation est obligatoire pour toutes les catégories Engins et Atelier (le bouton Enregistrer reste désactivé sans fichier).",
        ],
      },
      {
        id: "ready-for-use",
        title: "Quand un opérateur est « prêt »",
        paragraphs: [
          [
            "Le badge vert ",
            B("Prêt"),
            " sur une ligne d’autorisation ne s’allume que lorsque toutes les règles de cette catégorie passent :",
          ],
        ],
        bullets: [
          "Statut actif et fiche attestée (ligne verte de signature en haut de la fiche).",
          "Vision, Audition, Réaction et Pratique = Réussi (Écrit aussi requis pour tout-terrain, engins et atelier).",
          "Scan de permis en dossier, plus la règle des deux ans si la catégorie l’exige.",
          "Attestation de formation en dossier pour la ligne (engins et atelier).",
          "Niveau d’autorisation = Agréé ou Formateur.",
        ],
        callout: {
          variant: "success",
          paragraphs: [
            [
              "Les fiches affichent ",
              B("Prêt (véhicule de flotte)"),
              " en haut lorsque la règle on-road par défaut passe. Changer la classe du véhicule dans le contrôle conducteur requête à nouveau le registre pour cette catégorie — la liste reste cadrée sur qui est habilité pour ce véhicule précis.",
            ],
          ],
        },
      },
      {
        id: "sign-off",
        title: "Signature EHS",
        paragraphs: [
          [
            "Chaque fiche se termine par un bloc d’attestation : une case à cocher obligatoire (",
            B("Je confirme que les évaluations, le permis et les autorisations ci-dessus sont exacts"),
            ") plus un bouton ",
            B("Attester et enregistrer"),
            ".",
          ],
          [
            "Lorsque la case est cochée, l’enregistrement des évaluations / dates de permis sauvegarde et atteste en un geste. Toute modification ultérieure — sur la fiche ou sur une ligne d’autorisation — efface l’attestation ; EHS doit re-cocher et ré-enregistrer. Cela reproduit le modèle D018 « Approved by MSO YYYY-MM-DD » mais à la fiche plutôt qu’au document.",
          ],
        ],
      },
      {
        id: "suspending",
        title: "Suspendre ou retirer un conducteur",
        paragraphs: [
          [
            "Pour bloquer temporairement un conducteur (permis expirant, problème médical), passez le ",
            B("Statut"),
            " à ",
            B("suspendu"),
            " et enregistrez. Il sort de la liste du contrôle et ne peut plus soumettre de demande.",
          ],
          [
            "Utilisez ",
            B("Retirer du registre"),
            " uniquement lorsque la personne ne doit plus figurer du tout (départ, retrait définitif).",
          ],
        ],
      },
      {
        id: "effects",
        title: "Ce que le registre contrôle",
        bullets: [
          "Formulaire de contrôle → champ Conducteur : seuls les conducteurs pleinement conformes de cette organisation apparaissent. Les saisies libres sont acceptées mais signalées en orange.",
          "Demandes de véhicules → l’utilisateur connecté doit figurer au registre (superadmin excepté). L’API renvoie un message clair sinon.",
          "Administration → Approbateurs de contrôles est une liste séparée (qui peut valider les exceptions d’un contrôle). Être approbateur ne rend pas automatiquement conducteur agréé.",
        ],
      },
      {
        id: "troubleshooting",
        title: "Dépannage",
        bullets: [
          "Un conducteur n’apparaît pas dans la liste du contrôle → ouvrir sa fiche, passer les évaluations à Réussi, confirmer que le niveau pour la catégorie attendue (ex. véhicule sur route) est Agréé ou Formateur et que la fiche est ré-attestée.",
          "Message « Pas sur la liste des conducteurs agréés » sous le champ Conducteur → EHS n’a pas ajouté ou habilité cette personne pour la classe de véhicule sélectionnée (les poids lourds nécessitent une ligne d’autorisation distincte).",
          "Pas de badge Prêt sur une autorisation → vérifier les exigences de la catégorie (attestation de formation, test écrit pour engins / atelier).",
          "La liste RH est vide → le chargeur RH n’est visible que pour EHS, la direction flotte et les admins.",
          "Fiche affichée en Brouillon après une modification → c’est voulu ; cocher la case d’attestation et cliquer sur Attester et enregistrer pour la remettre en Prêt.",
          "Vous n’accédez pas à la page → connectez-vous à Fleet Hub ; le registre est visible par tout utilisateur connecté. Seuls les contrôles d’édition nécessitent des droits EHS / admin.",
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
          [
            B("Changer le statut op\u00e9rationnel / en entretien : "),
            "Ouvrez le v\u00e9hicule et utilisez la carte ",
            B("Quick Status Change"),
            ". Cycle de vie : ",
            B("operational"),
            " (par d\u00e9faut), ",
            B("deployed"),
            " (auto au d\u00e9part du trajet, revient \u00e0 operational au check-in), ",
            B("diagnosis"),
            " (pr\u00e9-OT \u2014 libre, aucun OT requis), puis ",
            B("maintenance-hq"),
            ", ",
            B("maintenance-3rdparty"),
            ", ",
            B("awaiting-parts"),
            " ou ",
            B("grounded"),
            " \u2014 chacun de ces quatre statuts ",
            B("exige un ordre de travail ouvert"),
            " (pi\u00e8ces et m\u00e9canicien). Sinon le syst\u00e8me bloque le changement et propose d'ouvrir un OT ou de basculer en ",
            B("diagnosis"),
            ". ",
            B("written-off"),
            " requiert la validation de la direction (admin / gestion flotte / direction / finance / superadmin) avec un motif \u00e9crit pour l'audit.",
          ],
          [
            B("Fermer un OT ne r\u00e9tablit pas automatiquement le statut. "),
            "Si un OT se cl\u00f4ture mais un autre probl\u00e8me appara\u00eet, le v\u00e9hicule reste en atelier ; la flotte confirme positivement le statut suivant.",
          ],
          [
            B("Liste des OT du v\u00e9hicule : "),
            "La carte Work orders est un tableau triable et pagin\u00e9. Les OT ouverts sont \u00e9pingl\u00e9s en haut ; les autres triés par date de cl\u00f4ture (d\u00e9croissante) par d\u00e9faut. Cliquez sur un en-t\u00eate pour changer le tri.",
          ],
        ],
        bullets: [
          "Quick Status Change (page d\u00e9tail) : utilisez-la \u00e0 chaque transition (operational, diagnosis, atelier, awaiting-parts, grounded, written-off). Un OT ouvert compte s'il est soumis jusqu'en in-progress, needs-parts, DA soumise (pr-submitted) ou awaiting-parts. Le syst\u00e8me applique cette r\u00e8gle et la validation direction.",
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
          [
            "Côté approvisionnement : ",
            B("needs-parts"),
            " (pièces identifiées, pas encore de demande d’achat) et ",
            B("pr-submitted"),
            " (DA liée ou soumise—en attente validation, PO ou livraison). ",
            B("En attente de pièces"),
            " reste le statut générique. La flotte peut lier PR/PO sur l’OT ; lorsque l’application DA est raccordée, elle peut enregistrer ces liens automatiquement.",
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
            " donne une vue coûts / performance par véhicule et par cohorte (catégorie, année, pool). Les métriques sont construites depuis la fiche véhicule, les trajets, les coûts main-d’œuvre / pièces / tiers des OT et l’entretien planifié.",
          ],
        ],
        bullets: [
          "TCO par véhicule : prix d’achat, coût de réparation, assurance, vie attendue ; met en évidence les véhicules au-dessus du budget.",
          "Score fin de vie (EOL) : combine km vs vie attendue, tendance coût/km et fiabilité récente pour signaler les remplacements.",
          "Comparaison cohortes : 4WD vs poids lourd vs tracteur vs engins, par année / pool / localisation, pour les achats.",
          "Export CSV via Rapports pour affiner en tableur.",
        ],
      },
      {
        id: "reports",
        title: "Rapports",
        paragraphs: [
          [
            L("/reports", "Rapports"),
            " propose des CSV téléchargeables. Définissez une plage de dates en haut (applicable aux trajets et OT) ; le registre véhicule l’ignore. Chaque ligne est un lien de téléchargement.",
          ],
        ],
        bullets: [
          "Ordres de travail (avec jours d’immobilisation).",
          "Registre véhicules.",
          "Trajets (check-out / check-in avec odomètre, itinéraire, conducteur, type de mission).",
          "Synthèse coûts par véhicule.",
          "Inspections et checklists.",
          "TCO et analyse fin de vie.",
          "Contrôles conducteur (avant déploiement).",
          "Entretien planifié (intervalles, prochains entretiens, retards).",
          "Demandes de véhicules.",
          "Indemnités véhicule perso (finance) — uniquement les demandes approuvées.",
        ],
      },
      {
        id: "daily-update",
        title: "Point quotidien",
        paragraphs: [
          [
            L("/daily-update", "Point quotidien"),
            " compose un court texte (véhicules immobilisés, OT ouverts / fermés, trajets en cours, alertes) à coller dans le brief WhatsApp ou e-mail.",
          ],
        ],
        bullets: [
          "Générer — texte construit depuis les données live au clic.",
          "Modifier — sortie éditable dans un textarea avant copie.",
          "Copier — presse-papier en un clic ; la langue suit EN / FR.",
          "Ré-générer plus tard pour un instantané actualisé.",
        ],
      },
      {
        id: "report-issue",
        title: "Signaler un problème (rapports terrain)",
        paragraphs: [
          [
            L("/report-issue", "Signaler un problème"),
            " est la voie terrain pour flagger un incident (panne, choc, bruit suspect, sécurité). Plus rapide qu’une inspection complète, convertible en OT par la flotte / les mécaniciens.",
          ],
        ],
        bullets: [
          "Choisir le véhicule, un titre court, une description, une gravité.",
          "Ajouter des photos — capture caméra sur téléphone.",
          "Envoyer — visible dans les vues Mécaniciens / OT pour triage.",
          "Convertir en OT — les managers ouvrent le rapport et cliquent sur « Convertir en OT » ; photos et description suivent.",
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              "Rapports terrain et contrôles conducteur ont des buts différents. Utilisez un ",
              B("contrôle"),
              " avant un trajet planifié. Utilisez un ",
              B("rapport"),
              " pour un imprévu sur la route.",
            ],
          ],
        },
      },
      {
        id: "admin",
        title: "Administration (référence, approbateurs, tarifs, GPS)",
        paragraphs: [
          [
            L("/admin", "Administration"),
            " est gérée par rôle : la donnée de référence est modifiable par admin flotte et superadmin ; les tarifs PVR par finance / superadmin ; les approbateurs par admin flotte. Les autres voient la page sans contrôles d’édition.",
          ],
        ],
        bullets: [
          "Données de référence — éditer sites, départements, types de mission et ateliers tiers utilisés dans toute l’app.",
          "Synchro depuis PR — récupérer les listes partagées depuis Firestore (lecture seule, pas d’écriture en retour).",
          "Approbateurs de contrôles — charger l’annuaire RH et choisir qui peut valider les exceptions de contrôle (par e-mail).",
          "Tarifs indemnité véhicule perso — tarif km et base LSL par organisation ; les valeurs par défaut s’appliquent tant qu’aucun tarif n’est enregistré.",
          "Mécaniciens de la flotte — registre canonique alimentant les sélecteurs Assigné à / Ouvrier dans les OT. Droits d’édition : admin, direction flotte (fleet_lead / manager) et départements PR DPO / HR / IT / Flotte (EHS exclu). Chaque création / modification / suppression / changement de statut est enregistré dans un journal de mutations append-only visible par fiche.",
          "GPS des sites — définir le GPS via la carte ou lat / long. Requis pour les distances sur les demandes.",
          "Point de départ trajet (siège flotte) — coordonnée utilisée pour la distance cartographiée ; fallback d’organisation quand l’origine véhicule / mission est inconnue.",
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              B("Journal de mutations : "),
              "les mécaniciens de la flotte et le registre EHS enregistrent chaque modification (acteur, rôle, département, snapshot avant / après, motif facultatif) dans une table d’audit append-only partagée. Le bouton « Voir l’historique » sur une fiche ouvre le journal.",
            ],
          ],
        },
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

  personalVehicleReimbursement: {
    title: "Indemnité véhicule personnel (F006)",
    subtitle:
      "Soumettre, approuver et exporter les indemnités kilométriques 1PWR lorsqu’aucun véhicule de la flotte n’est disponible.",
    sections: [
      {
        id: "purpose",
        title: "Objectif",
        paragraphs: [
          [
            L("/personal-vehicle-reimbursement", "Indemnité véhicule perso"),
            " remplace le tableur F006 lorsque la flotte 1PWR ne peut pas assigner de véhicule et que l’employé a conduit le sien. L’éligibilité est vérifiée côté serveur, le manager valide dans l’application, et la finance exporte les dossiers approuvés en CSV.",
          ],
        ],
      },
      {
        id: "eligibility",
        title: "Éligibilité",
        paragraphs: [
          [
            "Le bloc ",
            B("Éligibilité"),
            " en haut de page indique si vous pouvez soumettre. Une demande est bloquée tant que la flotte a un véhicule opérationnel disponible pour la plage du trajet — c’est voulu : le véhicule personnel est un recours, pas un choix.",
          ],
        ],
        bullets: [
          "« Éligible » en vert → vous pouvez soumettre.",
          "« Bloqué » en orange → un véhicule de la flotte est disponible ; utilisez Demandes.",
          "Dérogation manager / admin : les managers peuvent approuver des demandes soumises avant un changement d’éligibilité.",
        ],
      },
      {
        id: "attachments",
        title: "1. Pièces jointes avant envoi",
        paragraphs: [
          [
            "Chargez les pièces justificatives en premier — le bouton Envoyer ne se débloque qu’ensuite :",
          ],
        ],
        bullets: [
          "Attestation d’assurance à jour (image ou PDF).",
          "Photo(s) du compteur en début et fin de trajet (ou capture d’itinéraire).",
          "Facultatif : reçu carburant, péage, parking — tout ce qu’un audit finance demanderait.",
        ],
      },
      {
        id: "trip-details",
        title: "2. Détails du trajet",
        bullets: [
          "Date du trajet (obligatoire).",
          "Départ / Arrivée — choisir dans la liste des sites ou saisir en texte libre.",
          "Motif — aligné avec les motifs des demandes de véhicules.",
          "Kilométrage — total aller-retour ; le formulaire calcule l’indemnité estimée en LSL au tarif en vigueur.",
          "Notes — tout ce qui sort de l’ordinaire (détour, attente, escorte).",
        ],
        callout: {
          variant: "info",
          paragraphs: [
            [
              "Le tarif affiché vient de ",
              B("Administration → tarifs PVR"),
              " (finance / superadmin) pour votre organisation. La valeur par défaut s’applique tant qu’un tarif personnalisé n’a pas été enregistré.",
            ],
          ],
        },
      },
      {
        id: "approval",
        title: "3. Approbation du manager",
        paragraphs: [
          [
            "Chaque demande part en statut ",
            B("soumise"),
            ". Un manager (ou admin) ouvre la carte et clique sur ",
            B("Approuver"),
            " — la carte devient verte et le montant LSL est figé. ",
            B("Rejeter"),
            " avec un motif renvoie au demandeur.",
          ],
          [
            "Modifier la demande après approbation ré-ouvre le dossier et efface l’approbation, selon le même principe « toute modification efface la signature » que le registre EHS.",
          ],
        ],
      },
      {
        id: "export",
        title: "4. Export finance",
        paragraphs: [
          [
            "La finance récupère les demandes ",
            B("approuvées"),
            " depuis ",
            L("/reports", "Rapports"),
            " → « Personal vehicle reimbursement claims (finance) ». Le CSV contient le demandeur, le manager approbateur, le kilométrage, le tarif, le montant LSL, le nombre de pièces jointes et les détails du trajet, filtrés par la plage de dates en haut de Rapports.",
          ],
        ],
      },
      {
        id: "troubleshooting",
        title: "Dépannage",
        bullets: [
          "Le bouton Envoyer reste désactivé → une pièce jointe manque ou l’éligibilité est bloquée. Vérifiez les deux blocs en haut.",
          "Tarif incorrect → ouvrir Administration → tarifs PVR (finance / superadmin) et confirmer le tarif par km.",
          "Demande absente du CSV → elle est encore en état soumise. Seules les approuvées s’exportent — faites-la approuver.",
          "Le manager ne trouve pas la demande → vérifier qu’il est dans la même organisation (sélecteur en bas du menu).",
        ],
      },
    ],
  },

  countryTransfers: {
    title: "Transferts de pays / organisation",
    subtitle:
      "Corriger un pays erroné sur un véhicule, enregistrer un détachement temporaire ou acter un transfert permanent, avec les bonnes validations.",
    sections: [
      {
        id: "purpose",
        title: "Objectif",
        paragraphs: [
          [
            "Chaque véhicule est rattaché à un pays (via l’",
            B("organisation"),
            " — Lesotho, Zambie, Bénin). La file ",
            L("/vehicle-country-changes", "Transferts de pays"),
            " permet à la direction flotte de corriger ce rattachement s’il est faux, d’enregistrer un détachement, ou d’acter un transfert transfrontalier permanent avec les pièces requises.",
          ],
        ],
      },
      {
        id: "three-types",
        title: "Les trois types de changement",
        bullets: [
          "Correction de données — le véhicule a été mal codé (erreur, mauvaise organisation lors du seed). Justificatif : courte note. Approbateur : responsable flotte / manager / admin.",
          "Détachement — le véhicule opère temporairement dans un autre pays (projet, mission courte). Justificatifs : mission + inspection mécanique réussie. Approbateur : rôle executive (CEO / CFO / COO / superadmin).",
          "Transfert permanent — véhicule réaffecté durablement à une autre organisation. Mêmes justificatifs qu’un détachement avec une date de retour « jamais ». Approbateur : executive.",
        ],
      },
      {
        id: "submit",
        title: "Soumettre un changement",
        paragraphs: [
          [
            "Les soumissions partent de la fiche véhicule, pas de la file. Ouvrez un ",
            L("/vehicles", "véhicule"),
            " → carte ",
            B("Pays / organisation"),
            " → ",
            B("Demander un changement"),
            ".",
          ],
        ],
        bullets: [
          "Choisir le type : correction / détachement / transfert permanent.",
          "Choisir l’organisation de destination.",
          "Rédiger une courte explication. Pour détachement et transfert, relier la mission et la dernière inspection mécanique (transfert transfrontalier) réussie.",
          "Envoyer — la demande apparaît dans la file pour le bon rôle approbateur.",
        ],
      },
      {
        id: "approve",
        title: "Approuver une demande",
        paragraphs: [
          [
            "Sur ",
            L("/vehicle-country-changes", "Transferts de pays"),
            ", les approbateurs éligibles voient un bouton ",
            B("Approuver"),
            ". Les corrections sont approuvées par responsable flotte / manager / admin. Les détachements et transferts permanents nécessitent une signature executive et afficheront une bannière explicative si le rôle manque.",
          ],
          [
            B("Rejeter"),
            " avec un motif renvoie la demande sans modifier la fiche véhicule.",
          ],
        ],
        callout: {
          variant: "warning",
          paragraphs: [
            [
              "Approuver change immédiatement l’",
              B("organization_id"),
              " du véhicule — tableaux de bord, historique des trajets et filtre pays dans le menu se réajustent. Le véhicule disparaît des listes de l’ancien pays après approbation.",
            ],
          ],
        },
      },
      {
        id: "inspections-required",
        title: "Inspection mécanique pour transfert",
        paragraphs: [
          [
            "Pour les détachements et transferts permanents, les approbateurs recherchent une ",
            B("inspection mécanique (transfert transfrontalier)"),
            " récente et réussie (dans ",
            L("/inspections", "Inspections"),
            "). L’inspection mécanique détaillée peut faire foi si le template transfert n’existe pas dans votre organisation.",
          ],
        ],
      },
      {
        id: "history",
        title: "Historique récent",
        paragraphs: [
          [
            "Le bas de la page affiche les demandes récemment décidées (approuvées + rejetées). Utile comme piste d’audit ou pour confirmer qu’un changement a bien pris effet avant un contrôle ou un départ de trajet.",
          ],
        ],
      },
      {
        id: "troubleshooting",
        title: "Dépannage",
        bullets: [
          "Transferts de pays absent du menu → le lien est visible pour tout utilisateur connecté ; rafraîchir la session si vous voyez « Connexion requise ».",
          "« Approuver » désactivé avec bannière → votre rôle ne correspond pas au type de changement. Demandez au bon approbateur (flotte pour correction, executive pour transfert).",
          "Le véhicule affiche encore l’ancien pays → rafraîchir la page ou changer l’organisation dans le menu ; les requêtes d’autres onglets peuvent être en cache.",
          "Pas de template « mécanique (transfert transfrontalier) » → faites une inspection mécanique détaillée et référencez-la dans la note.",
        ],
      },
    ],
  },
};
