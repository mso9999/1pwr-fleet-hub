"use client";

import { useEffect, useState, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { pathToNavTarget } from "@/lib/tutorial-steps";
import { Button } from "@/components/ui/button";
import { useTutorial } from "./tutorial-context";

export function TutorialOverlay(): React.ReactElement | null {
  const { active, stepIndex, next, prev, exit, totalSteps, steps } = useTutorial();
  const pathname = usePathname();
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [missing, setMissing] = useState(false);

  const step = active ? steps[stepIndex] : null;

  const updateRect = useCallback(() => {
    if (!step || !active) {
      setRect(null);
      setMissing(false);
      return;
    }
    const pathOk = pathname === step.path || (step.path !== "/" && pathname.startsWith(step.path));
    const el = document.querySelector(`[data-tutorial="${step.target}"]`) as HTMLElement | null;
    if (!el || !pathOk) {
      if (!pathOk) {
        const navEl = document.querySelector(`[data-tutorial="${pathToNavTarget(step.path)}"]`);
        if (navEl) {
          const r = navEl.getBoundingClientRect();
          setRect({
            top: r.top - 4,
            left: r.left - 4,
            width: r.width + 8,
            height: r.height + 8,
          });
          setMissing(true);
          return;
        }
      }
      setMissing(!!el === false && pathOk);
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top - 6,
      left: r.left - 6,
      width: r.width + 12,
      height: r.height + 12,
    });
    setMissing(false);
  }, [step, active, pathname]);

  useLayoutEffect(() => {
    updateRect();
  }, [updateRect, stepIndex, pathname]);

  useEffect(() => {
    const ro = () => updateRect();
    window.addEventListener("resize", ro);
    const id = window.setInterval(ro, 400);
    return () => {
      window.removeEventListener("resize", ro);
      window.clearInterval(id);
    };
  }, [updateRect]);

  useEffect(() => {
    if (!step || !active) return;
    const pathOk = pathname === step.path || (step.path !== "/" && pathname.startsWith(step.path));
    if (!pathOk) return;
    const el = document.querySelector(`[data-tutorial="${step.target}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [step, active, pathname, stepIndex]);

  if (!active || typeof document === "undefined") return null;

  const stepData = steps[stepIndex];
  const isLast = stepIndex >= totalSteps - 1;

  const node = (
    <div className="fixed inset-0 z-[200] pointer-events-auto" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px]" />
      {rect && (
        <div
          className="fixed z-[201] rounded-lg border-2 border-blue-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] pointer-events-none ring-2 ring-blue-300/40"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}
      <div className="fixed bottom-0 left-0 right-0 z-[202] p-4 md:p-6 pointer-events-none">
        <div className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl pointer-events-auto">
          {missing && (
            <p className="text-xs text-amber-700 mb-2 font-medium">
              Open the highlighted navigation item or tap Next — the page is still loading.
            </p>
          )}
          <div id="tutorial-title" className="text-base font-semibold text-zinc-900">
            {stepData?.title}
          </div>
          <p className="mt-2 text-sm text-zinc-600 leading-relaxed">{stepData?.body}</p>
          {stepData?.suggestion && (
            <div className="mt-3 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-900">
              <span className="font-semibold">Tip: </span>
              {stepData.suggestion}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => prev()} disabled={stepIndex === 0}>
              Back
            </Button>
            <Button type="button" size="sm" onClick={() => next()} className="bg-blue-600 hover:bg-blue-700">
              {isLast ? "Finish tutorial" : "Next"}
            </Button>
            <button type="button" className="ml-auto text-xs text-zinc-500 hover:text-zinc-800 underline" onClick={() => exit()}>
              Exit &amp; clean up
            </button>
          </div>
          <div className="mt-2 text-[11px] text-zinc-400">
            Step {stepIndex + 1} of {totalSteps}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
