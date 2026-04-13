"use client";

import { useLocaleContext } from "@/i18n/locale-context";
import { useTutorial } from "./tutorial-context";

export function TutorialLaunchButton({ className }: { className?: string }): React.ReactElement {
  const { active, start } = useTutorial();
  const { t } = useLocaleContext();
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
      {t("tutorial.mode")}
    </button>
  );
}
