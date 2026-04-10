"use client";

import { createContext, useContext } from "react";

export interface TutorialContextValue {
  active: boolean;
  stepIndex: number;
  totalSteps: number;
  start: () => void;
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
