"use client";

import { createContext, useContext } from "react";
import type { TutorialStep } from "@/lib/tutorial-steps";

export interface TutorialContextValue {
  active: boolean;
  trackId: string;
  stepIndex: number;
  totalSteps: number;
  steps: TutorialStep[];
  start: (trackId?: string) => void;
  next: () => void;
  prev: () => void;
  exit: () => void;
}

export const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error("useTutorial must be used within TutorialProvider");
  }
  return ctx;
}
