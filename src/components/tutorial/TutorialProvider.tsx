"use client";

import { useCallback, useEffect, useMemo, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getTutorialSteps } from "@/lib/tutorial-steps";
import { TutorialOverlay } from "./TutorialOverlay";
import { TutorialContext } from "./tutorial-context";

const TUTORIAL_QUERY_MAP: Record<string, string> = {
  "1": "overview",
  start: "overview",
  overview: "overview",
  tour: "overview",
  "driver-check": "driverCheck",
  driverCheck: "driverCheck",
  "vehicle-inspection": "vehicleInspection",
  vehicleInspection: "vehicleInspection",
  inspection: "vehicleInspection",
  "vehicle-request": "vehicleRequest",
  vehicleRequest: "vehicleRequest",
  request: "vehicleRequest",
  "work-order": "workOrder",
  workOrder: "workOrder",
  loadout: "loadoutManifest",
  loadoutManifest: "loadoutManifest",
  manifest: "loadoutManifest",
  "country-transfer": "countryTransfer",
  countryTransfer: "countryTransfer",
  "country-transfers": "countryTransfer",
};

function TutorialSearchParamsBootstrap({
  onStart,
}: {
  onStart: (trackId: string) => void;
}): null {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    if (!user || pathname === "/login") return;
    const raw = searchParams.get("tutorial");
    if (!raw) return;
    const trackId = TUTORIAL_QUERY_MAP[raw];
    if (!trackId) return;
    onStart(trackId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("tutorial");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [searchParams, onStart, user, pathname]);

  return null;
}

export function TutorialProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const { organizationId } = useAuth();
  const [active, setActive] = useState(false);
  const [trackId, setTrackId] = useState("overview");
  const [stepIndex, setStepIndex] = useState(0);
  const seededRef = useRef<Set<string>>(new Set());

  const steps = useMemo(() => getTutorialSteps(trackId), [trackId]);
  const totalSteps = steps.length;

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
    setTrackId("overview");
    seededRef.current = new Set();
  }, [runCleanup]);

  const start = useCallback(
    (tid = "overview") => {
      setTrackId(tid);
      setStepIndex(0);
      setActive(true);
      seededRef.current = new Set();
      const first = getTutorialSteps(tid)[0];
      router.push(first.path);
    },
    [router]
  );

  const next = useCallback(async () => {
    if (stepIndex >= totalSteps - 1) {
      await exit();
      return;
    }
    const nextIdx = stepIndex + 1;
    const nextStep = steps[nextIdx];
    if (nextStep.path !== pathname) {
      router.push(nextStep.path);
    }
    setStepIndex(nextIdx);
  }, [stepIndex, totalSteps, pathname, router, exit, steps]);

  const prev = useCallback(() => {
    if (stepIndex <= 0) return;
    const prevIdx = stepIndex - 1;
    const prevStep = steps[prevIdx];
    if (prevStep.path !== pathname) {
      router.push(prevStep.path);
    }
    setStepIndex(prevIdx);
  }, [stepIndex, pathname, router, steps]);

  const step = active ? steps[stepIndex] : null;

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
      trackId,
      stepIndex,
      totalSteps,
      steps,
      start,
      next,
      prev,
      exit,
    }),
    [active, trackId, stepIndex, totalSteps, steps, start, next, prev, exit]
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
