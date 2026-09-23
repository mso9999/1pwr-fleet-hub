/**
 * Fleet Hub app-use quiz — required for EHS-approved drivers before they can be
 * designated on logistics requests / DVC pickers.
 *
 * Content is versioned; bump FM_APP_QUIZ_VERSION when questions change so
 * existing passes remain valid until we introduce re-certification.
 */

export const FM_APP_QUIZ_VERSION = "2026-09-23-v1";
/** Fraction correct required to pass (inclusive). */
export const FM_APP_QUIZ_PASS_RATIO = 0.8;

export type FmQuizLocale = "en" | "fr";

export type FmQuizQuestion = {
  id: string;
  prompt: { en: string; fr: string };
  choices: Array<{ id: string; label: { en: string; fr: string } }>;
  /** Correct choice id — never sent to the client until after grading. */
  correctChoiceId: string;
};

export const FM_APP_QUIZ_QUESTIONS: FmQuizQuestion[] = [
  {
    id: "q1",
    prompt: {
      en: "Who approves a mission trip plan (destination, dates, vehicle class)?",
      fr: "Qui approuve le plan de mission (destination, dates, classe de véhicule) ?",
    },
    choices: [
      { id: "a", label: { en: "Fleet lead", fr: "Responsable flotte" } },
      { id: "b", label: { en: "Mission approver (PM / management)", fr: "Approbateur de mission (PM / direction)" } },
      { id: "c", label: { en: "Any driver on the EHS register", fr: "Tout conducteur du registre EHS" } },
      { id: "d", label: { en: "Whoever created the mission", fr: "Celui qui a créé la mission" } },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q2",
    prompt: {
      en: "After a mission is approved, what must happen before Fleet can allocate a vehicle?",
      fr: "Après l’approbation d’une mission, que doit-il se passer avant que la flotte puisse allouer un véhicule ?",
    },
    choices: [
      { id: "a", label: { en: "The requestor / designated driver creates the planned trip", fr: "Le demandeur / conducteur désigné crée le trajet planifié" } },
      { id: "b", label: { en: "EHS re-attests the driver", fr: "L’EHS ré-atteste le conducteur" } },
      { id: "c", label: { en: "Finance pays for fuel", fr: "Les finances paient le carburant" } },
      { id: "d", label: { en: "Nothing — Fleet allocates immediately", fr: "Rien — la flotte alloue immédiatement" } },
    ],
    correctChoiceId: "a",
  },
  {
    id: "q3",
    prompt: {
      en: "Who allocates a pool vehicle to an approved mission that already has a trip?",
      fr: "Qui alloue un véhicule du parc à une mission approuvée qui a déjà un trajet ?",
    },
    choices: [
      { id: "a", label: { en: "The mission requestor", fr: "Le demandeur de la mission" } },
      { id: "b", label: { en: "Fleet lead", fr: "Responsable flotte" } },
      { id: "c", label: { en: "Any signed-in user", fr: "Tout utilisateur connecté" } },
      { id: "d", label: { en: "The designated passenger", fr: "Le passager désigné" } },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q4",
    prompt: {
      en: "On Request details, what does the orange Approve action do?",
      fr: "Sur les détails de demande, que fait l’action orange Approve ?",
    },
    choices: [
      { id: "a", label: { en: "Assigns a vehicle from the pool", fr: "Attribue un véhicule du parc" } },
      { id: "b", label: { en: "Approves the logistics request line (not vehicle allocation)", fr: "Approuve la ligne de demande logistique (pas l’allocation du véhicule)" } },
      { id: "c", label: { en: "Starts the trip departure", fr: "Démarre le départ du trajet" } },
      { id: "d", label: { en: "Creates the trip automatically", fr: "Crée le trajet automatiquement" } },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q5",
    prompt: {
      en: "Amber card “Next: requestor creates the trip” means:",
      fr: "La carte ambre « Next: requestor creates the trip » signifie :",
    },
    choices: [
      { id: "a", label: { en: "Fleet lead must allocate now", fr: "Le responsable flotte doit allouer maintenant" } },
      { id: "b", label: { en: "Mission is rejected", fr: "La mission est rejetée" } },
      { id: "c", label: { en: "Mission is approved; requestor/driver should create the trip on Trips", fr: "La mission est approuvée ; le demandeur/conducteur doit créer le trajet dans Trajets" } },
      { id: "d", label: { en: "Driver checklist is overdue", fr: "Le checklist conducteur est en retard" } },
    ],
    correctChoiceId: "c",
  },
  {
    id: "q6",
    prompt: {
      en: "Who completes the departing driver vehicle checklist before departure?",
      fr: "Qui remplit le checklist véhicule conducteur de départ avant le départ ?",
    },
    choices: [
      { id: "a", label: { en: "Fleet lead", fr: "Responsable flotte" } },
      { id: "b", label: { en: "Driver", fr: "Conducteur" } },
      { id: "c", label: { en: "Mission approver only", fr: "Uniquement l’approbateur de mission" } },
      { id: "d", label: { en: "Finance", fr: "Finances" } },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q7",
    prompt: {
      en: "Correct order for a company-vehicle field trip is:",
      fr: "L’ordre correct pour un trajet terrain en véhicule de société est :",
    },
    choices: [
      { id: "a", label: { en: "Allocate vehicle → create trip → approve mission → checklist", fr: "Allouer le véhicule → créer le trajet → approuver la mission → checklist" } },
      { id: "b", label: { en: "Approve mission → create trip → allocate vehicle → checklist → depart", fr: "Approuver la mission → créer le trajet → allouer le véhicule → checklist → partir" } },
      { id: "c", label: { en: "Create trip → approve mission → checklist → allocate", fr: "Créer le trajet → approuver la mission → checklist → allouer" } },
      { id: "d", label: { en: "Checklist → allocate → approve → trip", fr: "Checklist → allouer → approuver → trajet" } },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q8",
    prompt: {
      en: "Can the fleet lead alone approve missions?",
      fr: "Le responsable flotte peut-il approuver seul les missions ?",
    },
    choices: [
      { id: "a", label: { en: "Yes — that is their main job", fr: "Oui — c’est leur rôle principal" } },
      { id: "b", label: { en: "No — they allocate vehicles after the trip exists; PM approves missions", fr: "Non — ils allouent les véhicules après le trajet ; le PM approuve les missions" } },
      { id: "c", label: { en: "Only on weekends", fr: "Seulement le week-end" } },
      { id: "d", label: { en: "Only if no PM is available", fr: "Seulement si aucun PM n’est disponible" } },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q9",
    prompt: {
      en: "Green card “Fleet lead: allocate vehicles” appears when:",
      fr: "La carte verte « Fleet lead: allocate vehicles » apparaît quand :",
    },
    choices: [
      { id: "a", label: { en: "A mission is still pending approval", fr: "Une mission est encore en attente d’approbation" } },
      { id: "b", label: { en: "A planned trip already exists and no physical vehicle is allocated yet", fr: "Un trajet planifié existe déjà et aucun véhicule physique n’est encore alloué" } },
      { id: "c", label: { en: "The driver checklist failed", fr: "Le checklist conducteur a échoué" } },
      { id: "d", label: { en: "Always, for every mission", fr: "Toujours, pour chaque mission" } },
    ],
    correctChoiceId: "b",
  },
  {
    id: "q10",
    prompt: {
      en: "To be designated as the driver on a logistics request you must:",
      fr: "Pour être désigné comme conducteur sur une demande logistique, vous devez :",
    },
    choices: [
      { id: "a", label: { en: "Only have a WhatsApp account", fr: "Seulement avoir un compte WhatsApp" } },
      { id: "b", label: { en: "Be on the compliant EHS register and have passed the FM app quiz", fr: "Être sur le registre EHS conforme et avoir réussi le quiz de l’appli FM" } },
      { id: "c", label: { en: "Only know the vehicle code", fr: "Seulement connaître le code du véhicule" } },
      { id: "d", label: { en: "Be a fleet lead", fr: "Être responsable flotte" } },
    ],
    correctChoiceId: "b",
  },
];

export type FmQuizPublicQuestion = {
  id: string;
  prompt: string;
  choices: Array<{ id: string; label: string }>;
};

export function getFmQuizPublicQuestions(locale: FmQuizLocale = "en"): FmQuizPublicQuestion[] {
  const loc = locale === "fr" ? "fr" : "en";
  return FM_APP_QUIZ_QUESTIONS.map((q) => ({
    id: q.id,
    prompt: q.prompt[loc],
    choices: q.choices.map((c) => ({ id: c.id, label: c.label[loc] })),
  }));
}

export type FmQuizGradeResult = {
  passed: boolean;
  score: number;
  correctCount: number;
  total: number;
  version: string;
  /** Per-question feedback after grading (correctChoiceId revealed). */
  results: Array<{
    questionId: string;
    selectedChoiceId: string | null;
    correctChoiceId: string;
    correct: boolean;
  }>;
};

/**
 * Grade answers keyed by question id → choice id.
 */
export function gradeFmAppQuiz(
  answers: Record<string, string>
): FmQuizGradeResult {
  const results = FM_APP_QUIZ_QUESTIONS.map((q) => {
    const selected = String(answers[q.id] || "").trim() || null;
    const correct = selected === q.correctChoiceId;
    return {
      questionId: q.id,
      selectedChoiceId: selected,
      correctChoiceId: q.correctChoiceId,
      correct,
    };
  });
  const correctCount = results.filter((r) => r.correct).length;
  const total = results.length;
  const score = total > 0 ? correctCount / total : 0;
  return {
    passed: score >= FM_APP_QUIZ_PASS_RATIO,
    score,
    correctCount,
    total,
    version: FM_APP_QUIZ_VERSION,
    results,
  };
}

export function hasFmAppQuizPass(row: {
  fm_app_quiz_passed_at?: string | null;
}): boolean {
  return !!String(row.fm_app_quiz_passed_at || "").trim();
}
