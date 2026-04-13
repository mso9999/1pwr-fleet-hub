import type { Locale } from "@/i18n/messages";
import type { GuideContent } from "./types";
import { guideEn } from "./guide-en";
import { guideFr } from "./guide-fr";

const byLocale: Record<Locale, GuideContent> = {
  en: guideEn,
  fr: guideFr,
};

export function getGuideContent(locale: Locale): GuideContent {
  return byLocale[locale] ?? guideEn;
}

export type { GuideContent, GuideArticle, GuideIndex, GuideSection, GuideSegment } from "./types";
