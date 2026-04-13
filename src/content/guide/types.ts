import type { Locale } from "@/i18n/messages";

/** Inline rich text: strings, bold, or internal links */
export type GuideSegment =
  | string
  | { type: "strong"; text: string }
  | { type: "link"; href: string; label: string };

export interface GuideSection {
  id: string;
  title: string;
  /** Each inner array is one paragraph */
  paragraphs?: GuideSegment[][];
  /** Optional bullet list under the section */
  bullets?: string[];
  callout?: {
    variant: "info" | "warning" | "success";
    paragraphs: GuideSegment[][];
  };
}

export interface GuideArticle {
  title: string;
  subtitle: string;
  sections: GuideSection[];
}

export interface GuideIndex {
  title: string;
  intro: string;
  tutorialTitle: string;
  tutorialBody: GuideSegment[][];
  tutorialButton: string;
  tutorialOr: string;
  tutorialQuery: string;
  sections: Array<{ href: string; title: string; description: string }>;
  tipTitle: string;
  tipParagraphs: GuideSegment[][];
  productionUrl: string;
}

export type GuideContent = {
  index: GuideIndex;
  gettingStarted: GuideArticle;
  dailyWorkflows: GuideArticle;
  inspections: GuideArticle;
  vehicleChecks: GuideArticle;
  fleetAndMap: GuideArticle;
  maintenanceAndWork: GuideArticle;
  insightsAndField: GuideArticle;
};

export type GuideContentByLocale = Record<Locale, GuideContent>;
