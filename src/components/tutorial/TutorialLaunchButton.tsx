"use client";

import { useTutorial } from "./tutorial-context";

export function TutorialLaunchButton({ className }: { className?: string }): React.ReactElement {
  const { active, start } = useTutorial();
  if (active) return <></>;
  return (
    <button
      type="button"
      onClick={() => start()}
      className={
        className ||
        "text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
      }
    >
      Tutorial mode
    </button>
  );
}
