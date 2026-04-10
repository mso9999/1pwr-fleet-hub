"use client";

import { useCallback, useEffect, useMemo, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TUTORIAL_STEPS } from "@/lib/tutorial-steps";
import { TutorialOverlay } from "./TutorialOverlay";
import { TutorialContext } from "./tutorial-context";

function TutorialSearchParamsBootstrap({
  onStart,
}: {
  onStart: () => void;
}): null {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    if (!user || pathname === "/login") return;
    if (searchParams.get("tutorial") === "1" || searchParams.get("tutorial") === "start") {
      onStart();
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("tutorial");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    }
  }, [searchParams, onStart, user, pathname]);

  return null;
}

export function TutorialProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const { organizationId } = useAuth();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const seededRef = useRef<Set<string>>(new Set());

  const totalSteps = TUTORIAL_STEPS.length;

  const runCleanup = useCallback(async () => {
    try {
      await fetch("/api/tutorial/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
    } catch (e) {
      console.error("[tutorial] cleanup failed", e);
    }
  }, [organizationId]);

  const exit = useCallback(async () => {
    await runCleanup();
    setActive(false);
    setStepIndex(0);
    seededRef.current = new Set();
  }, [runCleanup]);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
    seededRef.current = new Set();
    router.push("/");
  }, [router]);

  const next = useCallback(async () => {
    if (stepIndex >= totalSteps - 1) {
      await exit();
      return;
    }
    const nextIdx = stepIndex + 1;
    const nextStep = TUTORIAL_STEPS[nextIdx];
    if (nextStep.path !== pathname) {
      router.push(nextStep.path);
    }
    setStepIndex(nextIdx);
  }, [stepIndex, totalSteps, pathname, router, exit]);

  const prev = useCallback(() => {
    if (stepIndex <= 0) return;
    const prevIdx = stepIndex - 1;
    const prevStep = TUTORIAL_STEPS[prevIdx];
    if (prevStep.path !== pathname) {
      router.push(prevStep.path);
    }
    setStepIndex(prevIdx);
  }, [stepIndex, pathname, router]);

  const step = active ? TUTORIAL_STEPS[stepIndex] : null;

  useEffect(() => {
    if (!active || !step?.seedOnEnter || seededRef.current.has(step.id)) return;
    const pathOk = pathname === step.path || (step.path !== "/" && pathname.startsWith(step.path));
    if (!pathOk) return;
    seededRef.current.add(step.id);
    void fetch("/api/tutorial/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    }).catch(() => {});
  }, [active, step, pathname, organizationId]);

  const value = useMemo(
    () => ({
      active,
      stepIndex,
      totalSteps,
      start,
      next,
      prev,
      exit,
    }),
    [active, stepIndex, totalSteps, start, next, prev, exit]
  );

  return (
    <TutorialContext.Provider value={value}>
      <Suspense fallback={null}>
        <TutorialSearchParamsBootstrap onStart={start} />
      </Suspense>
      {children}
      {active && <TutorialOverlay />}
    </TutorialContext.Provider>
  );
}
